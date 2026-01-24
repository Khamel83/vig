/**
 * D1 Database utilities for The Vig
 * All queries use prepared statements - no SQL injection
 */

import type { D1Database } from '@cloudflare/workers-types';

// Generate unique IDs
export function generateId(): string {
  return crypto.randomUUID();
}

// User types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  is_admin: number;
  created_at: number;
}

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
}

// Event types
export interface Event {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sport: string | null;
  status: 'draft' | 'open' | 'active' | 'completed';
  pool_type: string | null;
  max_selections: number | null;
  starts_at: number | null;
  ends_at: number | null;
  created_by: string | null;
  config: string;
  created_at: number;
  updated_at: number;
}

// Option types (teams, players)
export interface Option {
  id: string;
  event_id: string;
  external_id: string | null;
  name: string;
  abbreviation: string | null;
  logo_url: string | null;
  metadata: string;
  created_at: number;
}

// Selection types
export interface Selection {
  id: string;
  event_id: string;
  user_id: string;
  option_id: string;
  prediction_data: string;
  created_at: number;
}

// Game types
export interface Game {
  id: string;
  event_id: string;
  external_id: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  scheduled_at: number | null;
  metadata: string;
  updated_at: number;
}

// Standing types
export interface Standing {
  event_id: string;
  user_id: string;
  wins: number;
  losses: number;
  points: number;
  rank: number | null;
  updated_at: number;
}

// Session types
export interface Session {
  token: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}

// User queries
export const users = {
  async create(
    db: D1Database,
    data: { email: string; password_hash: string; name: string; is_admin?: boolean }
  ): Promise<User> {
    const id = generateId();
    const stmt = db.prepare(
      `INSERT INTO users (id, email, password_hash, name, is_admin) VALUES (?, ?, ?, ?, ?)`
    );
    await stmt.bind(id, data.email, data.password_hash, data.name, data.is_admin ? 1 : 0).run();
    return (await users.getById(db, id))!;
  },

  async getById(db: D1Database, id: string): Promise<User | null> {
    const stmt = db.prepare(`SELECT * FROM users WHERE id = ?`);
    return stmt.bind(id).first<User>();
  },

  async getByEmail(db: D1Database, email: string): Promise<User | null> {
    const stmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
    return stmt.bind(email).first<User>();
  },

  toPublic(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      is_admin: user.is_admin === 1,
    };
  },
};

// Event queries
export const events = {
  async create(
    db: D1Database,
    data: Partial<Omit<Event, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<Event> {
    const id = generateId();
    const stmt = db.prepare(`
      INSERT INTO events (id, slug, name, description, sport, status, pool_type, max_selections, starts_at, ends_at, created_by, config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    await stmt
      .bind(
        id,
        data.slug,
        data.name,
        data.description || null,
        data.sport || null,
        data.status || 'draft',
        data.pool_type || null,
        data.max_selections || null,
        data.starts_at || null,
        data.ends_at || null,
        data.created_by || null,
        data.config || '{}'
      )
      .run();
    return (await events.getById(db, id))!;
  },

  async getById(db: D1Database, id: string): Promise<Event | null> {
    const stmt = db.prepare(`SELECT * FROM events WHERE id = ?`);
    return stmt.bind(id).first<Event>();
  },

  async getBySlug(db: D1Database, slug: string): Promise<Event | null> {
    const stmt = db.prepare(`SELECT * FROM events WHERE slug = ?`);
    return stmt.bind(slug).first<Event>();
  },

  async list(db: D1Database, status?: string): Promise<Event[]> {
    if (status) {
      const stmt = db.prepare(`SELECT * FROM events WHERE status = ? ORDER BY created_at DESC`);
      const result = await stmt.bind(status).all<Event>();
      return result.results;
    }
    const stmt = db.prepare(`SELECT * FROM events ORDER BY created_at DESC`);
    const result = await stmt.all<Event>();
    return result.results;
  },

  async update(db: D1Database, id: string, data: Partial<Event>): Promise<Event | null> {
    const fields: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return events.getById(db, id);

    fields.push(`updated_at = strftime('%s', 'now')`);
    values.push(id);

    const stmt = db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE id = ?`);
    await stmt.bind(...values).run();
    return events.getById(db, id);
  },
};

// Option queries
export const options = {
  async create(
    db: D1Database,
    data: Omit<Option, 'id' | 'created_at'>
  ): Promise<Option> {
    const id = generateId();
    const stmt = db.prepare(`
      INSERT INTO options (id, event_id, external_id, name, abbreviation, logo_url, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    await stmt
      .bind(id, data.event_id, data.external_id, data.name, data.abbreviation, data.logo_url, data.metadata)
      .run();
    return (await options.getById(db, id))!;
  },

  async getById(db: D1Database, id: string): Promise<Option | null> {
    const stmt = db.prepare(`SELECT * FROM options WHERE id = ?`);
    return stmt.bind(id).first<Option>();
  },

  async listByEvent(db: D1Database, eventId: string): Promise<Option[]> {
    const stmt = db.prepare(`SELECT * FROM options WHERE event_id = ? ORDER BY name`);
    const result = await stmt.bind(eventId).all<Option>();
    return result.results;
  },

  async createBatch(db: D1Database, optionsList: Omit<Option, 'id' | 'created_at'>[]): Promise<void> {
    const batch = optionsList.map((opt) => {
      const id = generateId();
      return db
        .prepare(
          `INSERT INTO options (id, event_id, external_id, name, abbreviation, logo_url, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, opt.event_id, opt.external_id, opt.name, opt.abbreviation, opt.logo_url, opt.metadata);
    });
    await db.batch(batch);
  },
};

// Selection queries
export const selections = {
  async create(
    db: D1Database,
    data: Omit<Selection, 'id' | 'created_at'>
  ): Promise<Selection> {
    const id = generateId();
    const stmt = db.prepare(`
      INSERT INTO selections (id, event_id, user_id, option_id, prediction_data)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(event_id, user_id, option_id) DO UPDATE SET prediction_data = excluded.prediction_data
    `);
    await stmt.bind(id, data.event_id, data.user_id, data.option_id, data.prediction_data).run();
    return { id, ...data, created_at: Math.floor(Date.now() / 1000) };
  },

  async listByUser(db: D1Database, eventId: string, userId: string): Promise<Selection[]> {
    const stmt = db.prepare(`SELECT * FROM selections WHERE event_id = ? AND user_id = ?`);
    const result = await stmt.bind(eventId, userId).all<Selection>();
    return result.results;
  },

  async listByEvent(db: D1Database, eventId: string): Promise<Selection[]> {
    const stmt = db.prepare(`SELECT * FROM selections WHERE event_id = ?`);
    const result = await stmt.bind(eventId).all<Selection>();
    return result.results;
  },

  async delete(db: D1Database, eventId: string, userId: string, optionId: string): Promise<void> {
    const stmt = db.prepare(`DELETE FROM selections WHERE event_id = ? AND user_id = ? AND option_id = ?`);
    await stmt.bind(eventId, userId, optionId).run();
  },
};

// Standing queries
export const standings = {
  async upsert(
    db: D1Database,
    data: Omit<Standing, 'updated_at'>
  ): Promise<void> {
    const stmt = db.prepare(`
      INSERT INTO standings (event_id, user_id, wins, losses, points, rank)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id, user_id) DO UPDATE SET
        wins = excluded.wins,
        losses = excluded.losses,
        points = excluded.points,
        rank = excluded.rank,
        updated_at = strftime('%s', 'now')
    `);
    await stmt.bind(data.event_id, data.user_id, data.wins, data.losses, data.points, data.rank).run();
  },

  async listByEvent(db: D1Database, eventId: string): Promise<(Standing & { user_name: string })[]> {
    const stmt = db.prepare(`
      SELECT s.*, u.name as user_name
      FROM standings s
      JOIN users u ON s.user_id = u.id
      WHERE s.event_id = ?
      ORDER BY s.points DESC, s.wins DESC
    `);
    const result = await stmt.bind(eventId).all<Standing & { user_name: string }>();
    return result.results;
  },
};

// Session queries
export const sessions = {
  async create(db: D1Database, userId: string, expiresIn: number = 30 * 24 * 60 * 60): Promise<Session> {
    const token = crypto.randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const stmt = db.prepare(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`);
    await stmt.bind(token, userId, expiresAt).run();
    return { token, user_id: userId, expires_at: expiresAt, created_at: Math.floor(Date.now() / 1000) };
  },

  async getByToken(db: D1Database, token: string): Promise<Session | null> {
    const stmt = db.prepare(`SELECT * FROM sessions WHERE token = ? AND expires_at > ?`);
    return stmt.bind(token, Math.floor(Date.now() / 1000)).first<Session>();
  },

  async delete(db: D1Database, token: string): Promise<void> {
    const stmt = db.prepare(`DELETE FROM sessions WHERE token = ?`);
    await stmt.bind(token).run();
  },

  async deleteExpired(db: D1Database): Promise<void> {
    const stmt = db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`);
    await stmt.bind(Math.floor(Date.now() / 1000)).run();
  },
};
