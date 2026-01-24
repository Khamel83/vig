/**
 * Payment tracking operations for The Vig
 * Handles Venmo/CashApp payments, disputes, and automated reminders
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// Payment types
export type PaymentMethod = 'venmo' | 'cashapp' | 'cash' | 'other';
export type PaymentStatus = 'pending' | 'confirmed' | 'rejected';
export type DisputeStatus = 'none' | 'pending' | 'resolved';

export interface Payment {
  id: string;
  event_id: string;
  user_id: string;
  amount_cents: number;
  method: PaymentMethod;
  status: PaymentStatus;
  transaction_id?: string;
  notes?: string;
  dispute_notes?: string;
  dispute_status: DisputeStatus;
  confirmed_by?: string;
  confirmed_at?: number;
  created_at: number;
  updated_at: number;
}

export interface PaymentSettings {
  id: string;
  event_id: string;
  entry_fee_cents: number;
  payment_deadline?: number;
  prize_structure: Record<string, number>;
  payment_methods: PaymentMethod[];
  payment_instructions?: string;
}

// Payment CRUD operations
export const payments = {
  // Create a new payment
  async create(
    db: D1Database,
    data: {
      event_id: string;
      user_id: string;
      amount_cents: number;
      method: PaymentMethod;
      transaction_id?: string;
      notes?: string;
    }
  ): Promise<Payment> {
    const id = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const stmt = await db.prepare(`
      INSERT INTO payments (
        id, event_id, user_id, amount_cents, method,
        transaction_id, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `).bind(
      id,
      data.event_id,
      data.user_id,
      data.amount_cents,
      data.method,
      data.transaction_id,
      data.notes
    );
    await stmt.run();

    return this.getById(db, id);
  },

  // Get payment by ID
  async getById(db: D1Database, id: string): Promise<Payment | null> {
    const stmt = await db.prepare('SELECT * FROM payments WHERE id = ?').bind(id);
    const result = await stmt.first();

    if (!result) return null;

    return {
      id: result.id,
      event_id: result.event_id,
      user_id: result.user_id,
      amount_cents: result.amount_cents,
      method: result.method as PaymentMethod,
      status: result.status as PaymentStatus,
      transaction_id: result.transaction_id,
      notes: result.notes,
      dispute_notes: result.dispute_notes,
      dispute_status: result.dispute_status as DisputeStatus,
      confirmed_by: result.confirmed_by,
      confirmed_at: result.confirmed_at,
      created_at: result.created_at,
      updated_at: result.updated_at,
    };
  },

  // Get all payments for an event
  async getByEvent(db: D1Database, event_id: string): Promise<Payment[]> {
    const stmt = await db.prepare('SELECT * FROM payments WHERE event_id = ? ORDER BY created_at DESC').bind(event_id);
    const results = await stmt.all();

    return results.results.map(result => ({
      id: result.id,
      event_id: result.event_id,
      user_id: result.user_id,
      amount_cents: result.amount_cents,
      method: result.method as PaymentMethod,
      status: result.status as PaymentStatus,
      transaction_id: result.transaction_id,
      notes: result.notes,
      dispute_notes: result.dispute_notes,
      dispute_status: result.dispute_status as DisputeStatus,
      confirmed_by: result.confirmed_by,
      confirmed_at: result.confirmed_at,
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));
  },

  // Get payments by user
  async getByUser(db: D1Database, user_id: string): Promise<Payment[]> {
    const stmt = await db.prepare('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC').bind(user_id);
    const results = await stmt.all();

    return results.results.map(result => ({
      id: result.id,
      event_id: result.event_id,
      user_id: result.user_id,
      amount_cents: result.amount_cents,
      method: result.method as PaymentMethod,
      status: result.status as PaymentStatus,
      transaction_id: result.transaction_id,
      notes: result.notes,
      dispute_notes: result.dispute_notes,
      dispute_status: result.dispute_status as DisputeStatus,
      confirmed_by: result.confirmed_by,
      confirmed_at: result.confirmed_at,
      created_at: result.created_at,
      updated_at: result.updated_at,
    }));
  },

  // Update payment status
  async updateStatus(
    db: D1Database,
    id: string,
    status: PaymentStatus,
    confirmed_by?: string,
    notes?: string
  ): Promise<Payment | null> {
    const updateFields = ['status = ?'];
    const bindParams = [status];

    if (status === 'confirmed') {
      updateFields.push('confirmed_by = ?, confirmed_at = strftime("%s", "now")');
      bindParams.push(confirmed_by || 'system');
    }

    if (notes) {
      updateFields.push('notes = ?');
      bindParams.push(notes);
    }

    updateFields.push('updated_at = strftime("%s", "now")');

    const stmt = await db.prepare(`
      UPDATE payments
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).bind(...bindParams, id);

    await stmt.run();

    return this.getById(db, id);
  },

  // Open dispute
  async openDispute(db: D1Database, id: string, notes: string): Promise<Payment | null> {
    const stmt = await db.prepare(`
      UPDATE payments
      SET dispute_status = 'pending', dispute_notes = ?, updated_at = strftime("%s", "now")
      WHERE id = ?
    `).bind(notes, id);

    await stmt.run();

    return this.getById(db, id);
  },

  // Resolve dispute
  async resolveDispute(
    db: D1Database,
    id: string,
    resolution: 'confirmed' | 'rejected',
    notes: string,
    resolved_by: string
  ): Promise<Payment | null> {
    const stmt = await db.prepare(`
      UPDATE payments
      SET dispute_status = 'resolved', status = ?, dispute_notes = ?,
          confirmed_by = CASE WHEN ? = 'confirmed' THEN ? ELSE NULL END,
          confirmed_at = CASE WHEN ? = 'confirmed' THEN strftime("%s", "now") ELSE NULL END,
          updated_at = strftime("%s", "now")
      WHERE id = ?
    `).bind(
      resolution,
      notes,
      resolution,
      resolved_by,
      resolution,
      id
    );

    await stmt.run();

    return this.getById(db, id);
  },
};

// Payment settings operations
export const paymentSettings = {
  // Create or update payment settings
  async upsert(
    db: D1Database,
    event_id: string,
    data: {
      entry_fee_cents: number;
      payment_deadline?: number;
      prize_structure?: Record<string, number>;
      payment_methods?: PaymentMethod[];
      payment_instructions?: string;
    }
  ): Promise<PaymentSettings> {
    const id = `settings_${event_id}`;
    const prize_structure = data.prize_structure || { '1st': 0.5, '2nd': 0.3, '3rd': 0.2 };
    const payment_methods = data.payment_methods || ['venmo', 'cashapp'];

    const stmt = await db.prepare(`
      INSERT OR REPLACE INTO payment_settings (
        id, event_id, entry_fee_cents, payment_deadline,
        prize_structure, payment_methods, payment_instructions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `).bind(
      id,
      event_id,
      data.entry_fee_cents,
      data.payment_deadline || null,
      JSON.stringify(prize_structure),
      JSON.stringify(payment_methods),
      data.payment_instructions
    );

    await stmt.run();

    return this.getByEvent(db, event_id);
  },

  // Get payment settings for an event
  async getByEvent(db: D1Database, event_id: string): Promise<PaymentSettings | null> {
    const stmt = await db.prepare('SELECT * FROM payment_settings WHERE event_id = ?').bind(event_id);
    const result = await stmt.first();

    if (!result) return null;

    return {
      id: result.id,
      event_id: result.event_id,
      entry_fee_cents: result.entry_fee_cents,
      payment_deadline: result.payment_deadline,
      prize_structure: JSON.parse(result.prize_structure || '{}'),
      payment_methods: JSON.parse(result.payment_methods || '[]'),
      payment_instructions: result.payment_instructions,
    };
  },
};

// Payment helper functions
export const paymentHelpers = {
  // Check if payment is overdue
  isOverdue(payment: Payment): boolean {
    if (payment.status === 'confirmed') return false;
    if (!payment.created_at) return false;

    // Payment is overdue if created more than 24 hours ago
    const overdueTime = Date.now() - (24 * 60 * 60 * 1000);
    return payment.created_at * 1000 < overdueTime;
  },

  // Check if payment is due soon (within 24 hours)
  isDueSoon(payment: Payment): boolean {
    if (payment.status === 'confirmed') return false;
    if (!payment.created_at) return false;

    const dueSoonTime = Date.now() + (24 * 60 * 60 * 1000);
    return payment.created_at * 1000 < dueSoonTime;
  },

  // Format amount as currency
  formatAmount(amount_cents: number): string {
    return `$${(amount_cents / 100).toFixed(2)}`;
  },

  // Calculate winnings for a user
  calculateWinnings(
    userStandings: any[],
    prizeStructure: Record<string, number>,
    totalPrizePool: number
  ): number {
    // This would be implemented based on the specific pool type
    // For wins pools: calculate based on rank and prize distribution
    return 0; // Placeholder
  },
};