/**
 * Generic debt tracking for The Vig
 * Track debts outside of pools (e.g., "Adam owes me $20 for dinner")
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// Debt types
export type DebtStatus = 'outstanding' | 'paid' | 'cancelled';

export interface Debt {
  id: string;
  creditor_id: string;
  debtor_id: string;
  amount_cents: number;
  description?: string;
  status: DebtStatus;
  created_at: number;
  settled_at?: number;
}

// Debt CRUD operations
export const debts = {
  // Create a new debt
  async create(
    db: D1Database,
    data: {
      creditor_id: string;
      debtor_id: string;
      amount_cents: number;
      description?: string;
    }
  ): Promise<Debt> {
    const id = `debt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const stmt = await db.prepare(`
      INSERT INTO debts (id, creditor_id, debtor_id, amount_cents, description, created_at)
      VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
    `).bind(
      id,
      data.creditor_id,
      data.debtor_id,
      data.amount_cents,
      data.description
    );

    await stmt.run();

    return this.getById(db, id);
  },

  // Get debt by ID
  async getById(db: D1Database, id: string): Promise<Debt | null> {
    const stmt = await db.prepare('SELECT * FROM debts WHERE id = ?').bind(id);
    const result = await stmt.first();

    if (!result) return null;

    return {
      id: result.id,
      creditor_id: result.creditor_id,
      debtor_id: result.debtor_id,
      amount_cents: result.amount_cents,
      description: result.description,
      status: result.status as DebtStatus,
      created_at: result.created_at,
      settled_at: result.settled_at,
    };
  },

  // Get all debts for a user (both as creditor and debtor)
  async getByUser(db: D1Database, user_id: string): Promise<{
    as_creditor: Debt[];
    as_debtor: Debt[];
  }> {
    const creditorStmt = await db.prepare('SELECT * FROM debts WHERE creditor_id = ? ORDER BY created_at DESC').bind(user_id);
    const creditorResults = await creditorStmt.all();

    const debtorStmt = await db.prepare('SELECT * FROM debts WHERE debtor_id = ? ORDER BY created_at DESC').bind(user_id);
    const debtorResults = await debtorStmt.all();

    return {
      as_creditor: creditorResults.results.map(result => ({
        id: result.id,
        creditor_id: result.creditor_id,
        debtor_id: result.debtor_id,
        amount_cents: result.amount_cents,
        description: result.description,
        status: result.status as DebtStatus,
        created_at: result.created_at,
        settled_at: result.settled_at,
      })),
      as_debtor: debtorResults.results.map(result => ({
        id: result.id,
        creditor_id: result.creditor_id,
        debtor_id: result.debtor_id,
        amount_cents: result.amount_cents,
        description: result.description,
        status: result.status as DebtStatus,
        created_at: result.created_at,
        settled_at: result.settled_at,
      })),
    };
  },

  // Get outstanding debts for a user
  async getOutstandingByUser(db: D1Database, user_id: string): Promise<{
    owed_to_me: Debt[];
    i_owe: Debt[];
  }> {
    const creditorStmt = await db.prepare(`
      SELECT * FROM debts
      WHERE creditor_id = ? AND status = 'outstanding'
      ORDER BY created_at ASC
    `).bind(user_id);
    const creditorResults = await creditorStmt.all();

    const debtorStmt = await db.prepare(`
      SELECT * FROM debts
      WHERE debtor_id = ? AND status = 'outstanding'
      ORDER BY created_at ASC
    `).bind(user_id);
    const debtorResults = await debtorStmt.all();

    return {
      owed_to_me: creditorResults.results.map(result => ({
        id: result.id,
        creditor_id: result.creditor_id,
        debtor_id: result.debtor_id,
        amount_cents: result.amount_cents,
        description: result.description,
        status: result.status as DebtStatus,
        created_at: result.created_at,
        settled_at: result.settled_at,
      })),
      i_owe: debtorResults.results.map(result => ({
        id: result.id,
        creditor_id: result.creditor_id,
        debtor_id: result.debtor_id,
        amount_cents: result.amount_cents,
        description: result.description,
        status: result.status as DebtStatus,
        created_at: result.created_at,
        settled_at: result.settled_at,
      })),
    };
  },

  // Update debt status (mark as paid/cancelled)
  async updateStatus(
    db: D1Database,
    id: string,
    status: DebtStatus,
    updated_by: string
  ): Promise<Debt | null> {
    const stmt = await db.prepare(`
      UPDATE debts
      SET status = ?, settled_at = CASE WHEN ? = 'paid' THEN strftime('%s', 'now') ELSE NULL END,
      updated_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(
      status,
      status,
      id
    );

    await stmt.run();

    return this.getById(db, id);
  },

  // Get debts by status
  async getByStatus(db: D1Database, status: DebtStatus): Promise<Debt[]> {
    const stmt = await db.prepare('SELECT * FROM debts WHERE status = ? ORDER BY created_at DESC').bind(status);
    const results = await stmt.all();

    return results.results.map(result => ({
      id: result.id,
      creditor_id: result.creditor_id,
      debtor_id: result.debtor_id,
      amount_cents: result.amount_cents,
      description: result.description,
      status: result.status as DebtStatus,
      created_at: result.created_at,
      settled_at: result.settled_at,
    }));
  },

  // Delete a debt (soft delete - mark as cancelled)
  async cancel(db: D1Database, id: string, cancelled_by: string): Promise<boolean> {
    const stmt = await db.prepare(`
      UPDATE debts
      SET status = 'cancelled', settled_at = strftime('%s', 'now')
      WHERE id = ?
    `).bind(id);

    const result = await stmt.run();
    return result.changes > 0;
  },

  // Get debt summary for a user
  async getSummary(db: D1Database, user_id: string): Promise<{
    total_owed: number;
    total_i_owe: number;
    net_balance: number;
    count_owed: number;
    count_i_owe: number;
  }> {
    // Calculate total owed to me
    const owedStmt = await db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as count
      FROM debts
      WHERE creditor_id = ? AND status = 'outstanding'
    `).bind(user_id);
    const owedResult = await owedStmt.first();

    // Calculate total I owe
    const oweStmt = await db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) as total, COUNT(*) as count
      FROM debts
      WHERE debtor_id = ? AND status = 'outstanding'
    `).bind(user_id);
    const oweResult = await oweStmt.first();

    return {
      total_owed: owedResult.total,
      total_i_owe: oweResult.total,
      net_balance: owedResult.total - oweResult.total,
      count_owed: owedResult.count,
      count_i_owe: oweResult.count,
    };
  },
};

// Debt helper functions
export const debtHelpers = {
  // Format amount as currency
  formatAmount(amount_cents: number): string {
    return `$${(amount_cents / 100).toFixed(2)}`;
  },

  // Format relative amount (positive = owed to me, negative = I owe)
  formatRelative(amount_cents: number): string {
    if (amount_cents > 0) {
      return `+${this.formatAmount(amount_cents)} (owed to you)`;
    } else if (amount_cents < 0) {
      return `${this.formatAmount(Math.abs(amount_cents))} (you owe)`;
    }
    return 'Settled';
  },

  // Check if debt is overdue (older than 30 days)
  isOverdue(debt: Debt): boolean {
    if (debt.status !== 'outstanding') return false;
    if (!debt.created_at) return false;

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    return debt.created_at * 1000 < thirtyDaysAgo;
  },

  // Get debt age in days
  getAgeInDays(debt: Debt): number {
    if (!debt.created_at) return 0;
    return Math.floor((Date.now() - debt.created_at * 1000) / (24 * 60 * 60 * 1000));
  },
};