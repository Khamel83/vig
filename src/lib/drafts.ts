/**
 * Draft system for The Vig
 * Handles async snake draft state management
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// Draft types
export type DraftStatus = 'pending' | 'in_progress' | 'paused' | 'completed';

export interface Draft {
  id: string;
  event_id: string;
  status: DraftStatus;
  current_pick: number;
  current_round: number;
  total_rounds: number;
  total_picks: number;
  draft_order: string[]; // Array of user IDs
  created_by: string;
  created_at: number;
  updated_at: number;
  started_at?: number;
  completed_at?: number;
}

export interface DraftPick {
  id: string;
  draft_id: string;
  round: number;
  pick_number: number;
  user_id: string;
  option_id: string;
  picked_at: number;
  time_taken?: number;
}

export interface DraftTimer {
  draft_id: string;
  current_pick_deadline?: number;
  last_reminded_at?: number;
  paused_at?: number;
  paused_remaining_seconds?: number;
}

export interface DraftSettings {
  id: string;
  event_id: string;
  pick_time_seconds: number;
  reminder_minutes: number;
  enable_auto_skip: number;
  auto_skip_after_seconds: number;
  break_between_rounds_seconds: number;
  created_at: number;
  updated_at: number;
}

export interface DraftState {
  draft: Draft;
  current_picker?: string;
  available_options: Array<{ id: string; name: string; abbreviation?: string }>;
  picks: DraftPick[];
  timer?: DraftTimer;
}

// Draft CRUD operations
export const drafts = {
  // Create a new draft with snake order
  async create(
    db: D1Database,
    data: {
      event_id: string;
      total_rounds: number;
      draft_order: string[];
      created_by: string;
    }
  ): Promise<Draft> {
    const id = `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const total_picks = data.total_rounds * data.draft_order.length;

    const stmt = await db.prepare(`
      INSERT INTO drafts (id, event_id, status, current_pick, current_round, total_rounds, total_picks, draft_order, created_by)
      VALUES (?, ?, 'pending', 0, 1, ?, ?, ?, ?)
    `).bind(
      id,
      data.event_id,
      data.total_rounds,
      total_picks,
      JSON.stringify(data.draft_order),
      data.created_by
    );

    await stmt.run();

    // Create default draft settings
    await this.createDefaultSettings(db, id, data.event_id);

    return this.getById(db, id);
  },

  // Get draft by ID
  async getById(db: D1Database, id: string): Promise<Draft | null> {
    const stmt = await db.prepare('SELECT * FROM drafts WHERE id = ?').bind(id);
    const result = await stmt.first();

    if (!result) return null;

    return {
      id: result.id,
      event_id: result.event_id,
      status: result.status as DraftStatus,
      current_pick: result.current_pick,
      current_round: result.current_round,
      total_rounds: result.total_rounds,
      total_picks: result.total_picks,
      draft_order: JSON.parse(result.draft_order),
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
      started_at: result.started_at,
      completed_at: result.completed_at,
    };
  },

  // Get draft by event ID
  async getByEvent(db: D1Database, event_id: string): Promise<Draft | null> {
    const stmt = await db.prepare('SELECT * FROM drafts WHERE event_id = ?').bind(event_id);
    const result = await stmt.first();

    if (!result) return null;

    return this.getById(db, result.id);
  },

  // Start a draft
  async start(db: D1Database, id: string): Promise<Draft | null> {
    const stmt = await db.prepare(`
      UPDATE drafts
      SET status = 'in_progress',
          started_at = strftime('%s', 'now'),
          updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(id);

    await stmt.run();

    // Set initial timer
    const draft = await this.getById(db, id);
    if (draft) {
      await this.setPickDeadline(db, id, Date.now() / 1000 + 86400); // 24 hours
    }

    return this.getById(db, id);
  },

  // Pause a draft
  async pause(db: D1Database, id: string): Promise<Draft | null> {
    const stmt = await db.prepare(`
      UPDATE drafts
      SET status = 'paused',
          updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(id);

    await stmt.run();

    // Store remaining time
    const timer = await draftTimers.getById(db, id);
    if (timer && timer.current_pick_deadline) {
      const remaining = Math.max(0, timer.current_pick_deadline - Date.now() / 1000);
      await draftTimers.update(db, id, { paused_at: Date.now() / 1000, paused_remaining_seconds: remaining });
    }

    return this.getById(db, id);
  },

  // Resume a paused draft
  async resume(db: D1Database, id: string): Promise<Draft | null> {
    const timer = await draftTimers.getById(db, id);

    // Set new deadline accounting for paused time
    if (timer && timer.paused_remaining_seconds) {
      await this.setPickDeadline(db, id, Date.now() / 1000 + timer.paused_remaining_seconds);
      await draftTimers.update(db, id, { paused_at: undefined, paused_remaining_seconds: undefined });
    } else {
      await this.setPickDeadline(db, id, Date.now() / 1000 + 86400);
    }

    const stmt = await db.prepare(`
      UPDATE drafts
      SET status = 'in_progress',
          updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(id);

    await stmt.run();

    return this.getById(db, id);
  },

  // Complete a draft
  async complete(db: D1Database, id: string): Promise<Draft | null> {
    const stmt = await db.prepare(`
      UPDATE drafts
      SET status = 'completed',
          completed_at = strftime('%s', 'now'),
          updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(id);

    await stmt.run();

    return this.getById(db, id);
  },

  // Get current picker
  async getCurrentPicker(db: D1Database, draft: Draft): Promise<string | null> {
    if (draft.status !== 'in_progress' || draft.current_pick >= draft.total_picks) {
      return null;
    }

    // Snake draft: odd rounds reverse order
    const round = draft.current_round;
    const pickInRound = Math.floor(draft.current_pick / draft.draft_order.length);

    let userIndex: number;
    if (round % 2 === 1) {
      // Odd round: normal order
      userIndex = draft.current_pick % draft.draft_order.length;
    } else {
      // Even round: reverse order
      userIndex = draft.draft_order.length - 1 - (draft.current_pick % draft.draft_order.length);
    }

    return draft.draft_order[userIndex] || null;
  },

  // Make a pick
  async makePick(
    db: D1Database,
    draftId: string,
    userId: string,
    optionId: string
  ): Promise<{ success: boolean; error?: string; pick?: DraftPick }> {
    const draft = await this.getById(db, draftId);
    if (!draft) {
      return { success: false, error: 'Draft not found' };
    }

    if (draft.status !== 'in_progress') {
      return { success: false, error: 'Draft is not in progress' };
    }

    // Verify it's this user's turn
    const currentPicker = await this.getCurrentPicker(db, draft);
    if (currentPicker !== userId) {
      return { success: false, error: 'Not your turn to pick' };
    }

    // Check if option already picked
    const existingPick = await db.prepare(
      'SELECT 1 FROM draft_picks WHERE draft_id = ? AND option_id = ?'
    ).bind(draftId, optionId).first();

    if (existingPick) {
      return { success: false, error: 'Option already selected' };
    }

    const round = draft.current_round;
    const pickNumber = draft.current_pick + 1;

    // Create the pick
    const pickId = `pick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const pickStmt = await db.prepare(`
      INSERT INTO draft_picks (id, draft_id, round, pick_number, user_id, option_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(pickId, draftId, round, pickNumber, userId, optionId);

    await pickStmt.run();

    // Update draft state
    const newPick = draft.current_pick + 1;
    const newRound = Math.floor(newPick / draft.draft_order.length) + 1;

    const updateStmt = await db.prepare(`
      UPDATE drafts
      SET current_pick = ?,
          current_round = ?,
          updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(newPick, newRound, draftId);

    await updateStmt.run();

    // Check if draft is complete
    if (newPick >= draft.total_picks) {
      await this.complete(db, draftId);
    } else {
      // Set deadline for next picker
      await this.setPickDeadline(db, draftId, Date.now() / 1000 + 86400);
    }

    const pick = await draftPicks.getById(db, pickId);
    return { success: true, pick };
  },

  // Skip a pick (auto-skip for timeout)
  async skipPick(db: D1Database, draftId: string): Promise<{ success: boolean; error?: string; pick?: DraftPick }> {
    const draft = await this.getById(db, draftId);
    if (!draft) {
      return { success: false, error: 'Draft not found' };
    }

    const currentPicker = await this.getCurrentPicker(db, draft);
    if (!currentPicker) {
      return { success: false, error: 'No current picker' };
    }

    // Skip by making a dummy pick (option_id = 'skipped')
    return this.makePick(db, draftId, currentPicker, 'skipped');
  },

  // Set pick deadline
  async setPickDeadline(db: D1Database, draftId: string, deadline: number): Promise<void> {
    await db.prepare(`
      INSERT OR REPLACE INTO draft_timers (draft_id, current_pick_deadline)
      VALUES (?, ?)
    `).bind(draftId, deadline).run();
  },

  // Create default draft settings
  async createDefaultSettings(db: D1Database, draftId: string, eventId: string): Promise<void> {
    const settingsId = `settings_${eventId}`;
    await db.prepare(`
      INSERT OR IGNORE INTO draft_settings (id, event_id, pick_time_seconds, reminder_minutes, enable_auto_skip, auto_skip_after_seconds)
      VALUES (?, ?, 86400, 720, 1, 86400)
    `).bind(settingsId, eventId).run();
  },
};

// Draft picks operations
export const draftPicks = {
  async getById(db: D1Database, id: string): Promise<DraftPick | null> {
    const stmt = await db.prepare('SELECT * FROM draft_picks WHERE id = ?').bind(id);
    const result = await stmt.first();

    if (!result) return null;

    return {
      id: result.id,
      draft_id: result.draft_id,
      round: result.round,
      pick_number: result.pick_number,
      user_id: result.user_id,
      option_id: result.option_id,
      picked_at: result.picked_at,
      time_taken: result.time_taken,
    };
  },

  async getByDraft(db: D1Database, draftId: string): Promise<DraftPick[]> {
    const stmt = await db.prepare('SELECT * FROM draft_picks WHERE draft_id = ? ORDER BY pick_number').bind(draftId);
    const results = await stmt.all();

    return results.results.map(result => ({
      id: result.id,
      draft_id: result.draft_id,
      round: result.round,
      pick_number: result.pick_number,
      user_id: result.user_id,
      option_id: result.option_id,
      picked_at: result.picked_at,
      time_taken: result.time_taken,
    }));
  },

  async getByUser(db: D1Database, draftId: string, userId: string): Promise<DraftPick[]> {
    const stmt = await db.prepare(
      'SELECT * FROM draft_picks WHERE draft_id = ? AND user_id = ? ORDER BY pick_number'
    ).bind(draftId, userId);
    const results = await stmt.all();

    return results.results.map(result => ({
      id: result.id,
      draft_id: result.draft_id,
      round: result.round,
      pick_number: result.pick_number,
      user_id: result.user_id,
      option_id: result.option_id,
      picked_at: result.picked_at,
      time_taken: result.time_taken,
    }));
  },
};

// Draft timers operations
export const draftTimers = {
  async getById(db: D1Database, draftId: string): Promise<DraftTimer | null> {
    const stmt = await db.prepare('SELECT * FROM draft_timers WHERE draft_id = ?').bind(draftId);
    const result = await stmt.first();

    if (!result) return null;

    return {
      draft_id: result.draft_id,
      current_pick_deadline: result.current_pick_deadline,
      last_reminded_at: result.last_reminded_at,
      paused_at: result.paused_at,
      paused_remaining_seconds: result.paused_remaining_seconds,
    };
  },

  async update(db: D1Database, draftId: string, data: Partial<DraftTimer>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.current_pick_deadline !== undefined) {
      fields.push('current_pick_deadline = ?');
      values.push(data.current_pick_deadline);
    }
    if (data.last_reminded_at !== undefined) {
      fields.push('last_reminded_at = ?');
      values.push(data.last_reminded_at);
    }
    if (data.paused_at !== undefined) {
      fields.push('paused_at = ?');
      values.push(data.paused_at);
    }
    if (data.paused_remaining_seconds !== undefined) {
      fields.push('paused_remaining_seconds = ?');
      values.push(data.paused_remaining_seconds);
    }

    if (fields.length === 0) return;

    values.push(draftId);

    await db.prepare(`
      INSERT OR REPLACE INTO draft_timers (draft_id, ${fields.join(', ')})
      VALUES (?, ${fields.map(() => '?').join(', ')})
    `).bind(...values).run();
  },
};

// Draft settings operations
export const draftSettings = {
  async getByEvent(db: D1Database, eventId: string): Promise<DraftSettings | null> {
    const stmt = await db.prepare('SELECT * FROM draft_settings WHERE event_id = ?').bind(eventId);
    const result = await stmt.first();

    if (!result) return null;

    return {
      id: result.id,
      event_id: result.event_id,
      pick_time_seconds: result.pick_time_seconds,
      reminder_minutes: result.reminder_minutes,
      enable_auto_skip: result.enable_auto_skip,
      auto_skip_after_seconds: result.auto_skip_after_seconds,
      break_between_rounds_seconds: result.break_between_rounds_seconds,
      created_at: result.created_at,
      updated_at: result.updated_at,
    };
  },

  async upsert(db: D1Database, eventId: string, data: Partial<DraftSettings>): Promise<DraftSettings | null> {
    const id = `settings_${eventId}`;

    const stmt = await db.prepare(`
      INSERT INTO draft_settings (id, event_id, pick_time_seconds, reminder_minutes, enable_auto_skip, auto_skip_after_seconds, break_between_rounds_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id) DO UPDATE SET
        pick_time_seconds = COALESCE(?, pick_time_seconds),
        reminder_minutes = COALESCE(?, reminder_minutes),
        enable_auto_skip = COALESCE(?, enable_auto_skip),
        auto_skip_after_seconds = COALESCE(?, auto_skip_after_seconds),
        break_between_rounds_seconds = COALESCE(?, break_between_rounds_seconds),
        updated_at = strftime('%s', 'now')
    `).bind(
      id, eventId,
      data.pick_time_seconds || 86400,
      data.reminder_minutes || 720,
      data.enable_auto_skip ?? 1,
      data.auto_skip_after_seconds || 86400,
      data.break_between_rounds_seconds || 0,
      data.pick_time_seconds || 86400,
      data.reminder_minutes || 720,
      data.enable_auto_skip ?? 1,
      data.auto_skip_after_seconds || 86400,
      data.break_between_rounds_seconds || 0
    );

    await stmt.run();

    return this.getByEvent(db, eventId);
  },
};

// Helper functions
export const draftHelpers = {
  // Generate snake draft order from list of users
  generateSnakeOrder(userIds: string[], rounds: number): string[] {
    // Shuffle users for random initial order
    const shuffled = [...userIds].sort(() => Math.random() - 0.5);
    return shuffled;
  },

  // Check if a pick has timed out
  isPickTimedOut(timer: DraftTimer | null): boolean {
    if (!timer || !timer.current_pick_deadline) return false;
    return Date.now() / 1000 > timer.current_pick_deadline;
  },

  // Get remaining time for current pick
  getRemainingTime(timer: DraftTimer | null): number {
    if (!timer || !timer.current_pick_deadline) return 0;
    return Math.max(0, timer.current_pick_deadline - Date.now() / 1000);
  },

  // Format remaining time as human readable
  formatRemainingTime(seconds: number): string {
    if (seconds <= 0) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  },
};
