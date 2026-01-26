-- Draft system for async snake drafts
-- Migration: 0007_drafts.sql

-- Drafts table - main draft state
CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',  -- pending, in_progress, paused, completed
    current_pick INTEGER DEFAULT 0,
    current_round INTEGER DEFAULT 1,
    total_rounds INTEGER NOT NULL,
    total_picks INTEGER NOT NULL,
    draft_order TEXT NOT NULL,  -- JSON array of user IDs in draft order
    created_by TEXT REFERENCES users(id),
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    started_at INTEGER,
    completed_at INTEGER
);

-- Draft picks table - individual selections
CREATE TABLE IF NOT EXISTS draft_picks (
    id TEXT PRIMARY KEY,
    draft_id TEXT NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    round INTEGER NOT NULL,
    pick_number INTEGER NOT NULL,  -- Overall pick number (1-based)
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL REFERENCES options(id) ON DELETE CASCADE,
    picked_at INTEGER DEFAULT (strftime('%s', 'now')),
    time_taken INTEGER,  -- Seconds taken to make pick
    UNIQUE(draft_id, round, pick_number)
);

-- Draft timers table - tracks pick time limits
CREATE TABLE IF NOT EXISTS draft_timers (
    draft_id TEXT PRIMARY KEY REFERENCES drafts(id) ON DELETE CASCADE,
    current_pick_deadline INTEGER,
    last_reminded_at INTEGER,
    paused_at INTEGER,
    paused_remaining_seconds INTEGER DEFAULT 86400  -- 24 hours default
);

-- Draft settings per event
CREATE TABLE IF NOT EXISTS draft_settings (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
    pick_time_seconds INTEGER DEFAULT 86400,  -- 24 hours default
    reminder_minutes INTEGER DEFAULT 720,  -- 12 hours before deadline
    enable_auto_skip INTEGER DEFAULT 1,
    auto_skip_after_seconds INTEGER DEFAULT 86400,  -- 24 hours
    break_between_rounds_seconds INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_drafts_event ON drafts(event_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);
CREATE INDEX IF NOT EXISTS idx_draft_picks_draft ON draft_picks(draft_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_user ON draft_picks(user_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_option ON draft_picks(option_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_round_pick ON draft_picks(draft_id, round, pick_number);
CREATE INDEX IF NOT EXISTS idx_draft_settings_event ON draft_settings(event_id);

-- Trigger to update updated_at timestamp on drafts
CREATE TRIGGER IF NOT EXISTS update_drafts_updated_at
    AFTER UPDATE ON drafts
    FOR EACH ROW
BEGIN
    UPDATE drafts SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

-- Trigger to update updated_at on draft_settings
CREATE TRIGGER IF NOT EXISTS update_draft_settings_updated_at
    AFTER UPDATE ON draft_settings
    FOR EACH ROW
BEGIN
    UPDATE draft_settings SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;
