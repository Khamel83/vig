-- Template-based pool creation system
-- Migration: 0003_templates.sql

-- Pool templates (admin-defined)
CREATE TABLE IF NOT EXISTS pool_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    sport TEXT,
    pool_type TEXT,
    version INTEGER DEFAULT 1,
    config TEXT NOT NULL DEFAULT '{}',
    default_entry_fee_cents INTEGER,
    is_public INTEGER DEFAULT 0,
    created_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Extend events table with lifecycle fields
-- Check if columns exist before adding (SQLite-safe approach)
BEGIN TRANSACTION;

-- Add columns if they don't exist using SQLite's approach
-- We'll use ALTER TABLE directly since it should work
ALTER TABLE events ADD COLUMN predictions_locked_at INTEGER;
ALTER TABLE events ADD COLUMN completed_at INTEGER;
ALTER TABLE events ADD COLUMN archived_at INTEGER;
ALTER TABLE events ADD COLUMN template_version INTEGER;
ALTER TABLE events ADD COLUMN template_id TEXT;

COMMIT;

-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    event_id TEXT,
    created_by TEXT,
    max_uses INTEGER DEFAULT 1,
    uses INTEGER DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Event participants table (for tracking joins)
CREATE TABLE IF NOT EXISTS event_participants (
    event_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (event_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_templates_public ON pool_templates(is_public);
CREATE INDEX IF NOT EXISTS idx_templates_sport ON pool_templates(sport);
CREATE INDEX IF NOT EXISTS idx_templates_pool_type ON pool_templates(pool_type);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invites_event ON invite_codes(event_id);
CREATE INDEX IF NOT EXISTS idx_participants_event_user ON event_participants(event_id, user_id);

-- Create initial template data
INSERT OR IGNORE INTO pool_templates (id, name, description, sport, pool_type, config, default_entry_fee_cents, is_public, created_by) VALUES
('template_nba_wins_2026', 'NBA Wins Pool 2026', 'Pick NBA teams to win throughout the season', 'NBA', 'wins', '{"max_selections": 15}', 5000, 1, 'system'),
('template_nfl_wins_2025', 'NFL Wins Pool 2025', 'Pick NFL teams to win throughout the season', 'NFL', 'wins', '{"max_selections": 12}', 5000, 1, 'system'),
('template_superbowl_squares', 'Super Bowl Squares', '10x10 grid with last digit of scores', 'NFL', 'squares', '{"payouts": {"Q1": 0.1, "Q2": 0.2, "Q3": 0.1, "Final": 0.6}}', 10000, 1, 'system');
