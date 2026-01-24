-- Generic debt tracking system
-- Migration: 0004_debts.sql

CREATE TABLE IF NOT EXISTS debts (
    id TEXT PRIMARY KEY,
    creditor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    debtor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'outstanding',  -- outstanding, paid, cancelled
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    settled_at INTEGER,
    FOREIGN KEY (creditor_id) REFERENCES users(id),
    FOREIGN KEY (debtor_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_debts_creditor ON debts(creditor_id, status);
CREATE INDEX IF NOT EXISTS idx_debts_debtor ON debts(debtor_id, status);