/**
 * Pool management for The Vig
 * Handles template-based pool creation and lifecycle management
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// Pool lifecycle states
export type PoolStatus = 'draft' | 'open' | 'locked' | 'completed' | 'archived';

export interface PoolTemplate {
  id: string;
  name: string;
  description: string;
  sport: string;
  pool_type: string;
  version: number;
  config: Record<string, any>;
  default_entry_fee_cents: number;
  is_public: number;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface PoolLifecycle {
  event_id: string;
  status: PoolStatus;
  predictions_locked_at?: number;
  completed_at?: number;
  archived_at?: number;
  template_version?: number;
  template_id?: string;
}

// Pool template operations
export const poolTemplates = {
  // Get all templates
  async getAll(db: D1Database): Promise<PoolTemplate[]> {
    const stmt = await db.prepare('SELECT * FROM pool_templates ORDER BY sport, pool_type, version DESC');
    const results = await stmt.all();

    return results.results.map(result => ({
      id: result.id,
      name: result.name,
      description: result.description,
      sport: result.sport,
      pool_type: result.pool_type,
      version: result.version,
      config: JSON.parse(result.config || '{}'),
      default_entry_fee_cents: result.default_entry_fee_cents,
      is_public: result.is_public,
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));
  },

  // Get public templates
  async getPublic(db: D1Database): Promise<PoolTemplate[]> {
    const stmt = await db.prepare('SELECT * FROM pool_templates WHERE is_public = 1 ORDER BY sport, pool_type');
    const results = await stmt.all();

    return results.results.map(result => ({
      id: result.id,
      name: result.name,
      description: result.description,
      sport: result.sport,
      pool_type: result.pool_type,
      version: result.version,
      config: JSON.parse(result.config || '{}'),
      default_entry_fee_cents: result.default_entry_fee_cents,
      is_public: result.is_public,
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));
  },

  // Get template by ID
  async getById(db: D1Database, id: string): Promise<PoolTemplate | null> {
    const stmt = await db.prepare('SELECT * FROM pool_templates WHERE id = ?').bind(id);
    const result = await stmt.first();

    if (!result) return null;

    return {
      id: result.id,
      name: result.name,
      description: result.description,
      sport: result.sport,
      pool_type: result.pool_type,
      version: result.version,
      config: JSON.parse(result.config || '{}'),
      default_entry_fee_cents: result.default_entry_fee_cents,
      is_public: result.is_public,
      created_by: result.created_by,
      created_at: result.created_at,
      updated_at: result.updated_at,
    };
  },

  // Create new template (admin only)
  async create(
    db: D1Database,
    data: {
      name: string;
      description: string;
      sport: string;
      pool_type: string;
      config: Record<string, any>;
      default_entry_fee_cents?: number;
      is_public?: number;
      created_by: string;
    }
  ): Promise<PoolTemplate> {
    const id = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const version = 1; // Initial version

    const stmt = await db.prepare(`
      INSERT INTO pool_templates (id, name, description, sport, pool_type, version, config, default_entry_fee_cents, is_public, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `).bind(
      id,
      data.name,
      data.description,
      data.sport,
      data.pool_type,
      version,
      JSON.stringify(data.config),
      data.default_entry_fee_cents,
      data.is_public || 0,
      data.created_by
    );

    await stmt.run();

    return this.getById(db, id);
  },

  // Update template (creates new version)
  async update(
    db: D1Database,
    id: string,
    data: {
      name?: string;
      description?: string;
      config?: Record<string, any>;
      default_entry_fee_cents?: number;
      is_public?: number;
    },
    updated_by: string
  ): Promise<PoolTemplate | null> {
    // Get current template
    const current = await this.getById(db, id);
    if (!current) return null;

    // Create new version
    const newVersion = current.version + 1;
    const stmt = await db.prepare(`
      INSERT INTO pool_templates (id, name, description, sport, pool_type, version, config, default_entry_fee_cents, is_public, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `).bind(
      `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      data.name || current.name,
      data.description || current.description,
      current.sport,
      current.pool_type,
      newVersion,
      JSON.stringify(data.config || current.config),
      data.default_entry_fee_cents || current.default_entry_fee_cents,
      data.is_public !== undefined ? data.is_public : current.is_public,
      updated_by
    );

    await stmt.run();

    return this.getById(db, `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  },
};

// Pool lifecycle operations
export const poolLifecycle = {
  // Get pool lifecycle status
  async get(db: D1Database, event_id: string): Promise<PoolLifecycle | null> {
    const stmt = await db.prepare('SELECT * FROM events WHERE id = ?').bind(event_id);
    const result = await stmt.first();

    if (!result) return null;

    return {
      event_id: result.id,
      status: result.status as PoolStatus,
      predictions_locked_at: result.predictions_locked_at,
      completed_at: result.completed_at,
      archived_at: result.archived_at,
      template_version: result.template_version,
      template_id: result.template_id,
    };
  },

  // Update pool status
  async updateStatus(
    db: D1Database,
    event_id: string,
    status: PoolStatus,
    updated_by: string
  ): Promise<PoolLifecycle | null> {
    const updateFields = ['status = ?'];
    const bindParams = [status];

    switch (status) {
      case 'locked':
        updateFields.push('predictions_locked_at = strftime("%s", "now")');
        break;
      case 'completed':
        updateFields.push('completed_at = strftime("%s", "now")');
        break;
      case 'archived':
        updateFields.push('archived_at = strftime("%s", "now")');
        break;
    }

    updateFields.push('updated_at = strftime("%s", "now")');

    const stmt = await db.prepare(`
      UPDATE events
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).bind(...bindParams, event_id);

    await stmt.run();

    return this.get(db, event_id);
  },

  // Set template for pool
  async setTemplate(
    db: D1Database,
    event_id: string,
    template_id: string,
    template_version: number
  ): Promise<boolean> {
    const stmt = await db.prepare(`
      UPDATE events
      SET template_id = ?, template_version = ?, updated_at = strftime("%s", "now")
      WHERE id = ?
    `).bind(template_id, template_version, event_id);

    const result = await stmt.run();
    return result.changes > 0;
  },

  // Check if pool can transition to next state
  async canTransition(db: D1Database, event_id: string, from_status: PoolStatus, to_status: PoolStatus): Promise<boolean> {
    const validTransitions = {
      draft: ['open'],
      open: ['locked'],
      locked: ['completed'],
      completed: ['archived'],
    };

    // Check if transition is valid
    if (!validTransitions[from_status]?.includes(to_status)) {
      return false;
    }

    // Additional checks for specific transitions
    if (from_status === 'open' && to_status === 'locked') {
      // Check if minimum number of participants joined
      const participantsStmt = await db.prepare('SELECT COUNT(*) as count FROM event_participants WHERE event_id = ?').bind(event_id);
      const participants = await participantsStmt.first();

      // Require at least 2 participants to start
      if (participants.count < 2) {
        return false;
      }
    }

    return true;
  },
};

// Helper functions
export const poolHelpers = {
  // Generate pool creation summary
  createPoolSummary(template: PoolTemplate, config: {
    name: string;
    entry_fee_cents: number;
    payment_deadline?: number;
    max_uses?: number;
  }) {
    return {
      template: template.name,
      sport: template.sport,
      pool_type: template.pool_type,
      entry_fee: config.entry_fee_cents,
      payment_deadline: config.payment_deadline,
      max_uses: config.max_uses,
      config: template.config,
    };
  },

  // Validate pool configuration
  validatePoolConfig(poolType: string, config: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors = [];

    switch (poolType) {
      case 'wins':
        if (!config.max_selections || config.max_selections < 1 || config.max_selections > 50) {
          errors.push('max_selections must be between 1 and 50');
        }
        break;

      case 'squares':
        if (config.grid_size && config.grid_size !== 10) {
          errors.push('squares pool must have 10x10 grid');
        }
        if (!config.payouts || Object.keys(config.payouts).length === 0) {
          errors.push('squares pool must have payout structure');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },
};