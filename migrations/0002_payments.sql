-- Payment tracking system for The Vig
-- Migration: 0002_payments.sql

-- Payment settings table (per pool)
CREATE TABLE IF NOT EXISTS payment_settings (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    entry_fee_cents INTEGER NOT NULL,
    payment_deadline INTEGER,  -- Unix timestamp
    prize_structure TEXT NOT NULL DEFAULT '{}',  -- JSON: { "1st": 0.5, "2nd": 0.3, "3rd": 0.2 }
    payment_methods TEXT NOT NULL DEFAULT '["venmo", "cashapp"]',  -- JSON array
    payment_instructions TEXT,  -- Venmo/CashApp handle
    UNIQUE(event_id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    method TEXT,  -- 'venmo', 'cashapp', 'cash', 'other'
    status TEXT DEFAULT 'pending',  -- pending, confirmed, rejected
    transaction_id TEXT,
    notes TEXT,
    dispute_notes TEXT,
    dispute_status TEXT DEFAULT 'none',  -- none, pending, resolved
    confirmed_by TEXT REFERENCES users(id),
    confirmed_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_event_user ON payments(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_confirmed_by ON payments(confirmed_by);

-- Trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_payments_updated_at
    AFTER UPDATE ON payments
    FOR EACH ROW
BEGIN
    UPDATE payments SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;