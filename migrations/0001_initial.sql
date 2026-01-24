-- The Vig - Initial Database Schema
-- D1 SQLite database for Cloudflare

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Events/Pools
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,        -- Path: "nfl-2025"
    name TEXT NOT NULL,
    description TEXT,
    sport TEXT,                       -- NFL, NBA, NCAA_FB
    status TEXT DEFAULT 'draft',      -- draft, open, active, completed
    pool_type TEXT,                   -- wins, bracket, squares, spread
    max_selections INTEGER,
    starts_at INTEGER,
    ends_at INTEGER,
    created_by TEXT REFERENCES users(id),
    config TEXT NOT NULL DEFAULT '{}', -- JSON config for pool-specific settings
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Options (teams, players, etc.)
CREATE TABLE IF NOT EXISTS options (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    external_id TEXT,                 -- External API ID (e.g., TheRundown team ID)
    name TEXT NOT NULL,
    abbreviation TEXT,
    logo_url TEXT,
    metadata TEXT DEFAULT '{}',       -- JSON for extra data
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- User Selections (picks)
CREATE TABLE IF NOT EXISTS selections (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL REFERENCES options(id) ON DELETE CASCADE,
    prediction_data TEXT DEFAULT '{}', -- Flexible JSON for different pool types
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(event_id, user_id, option_id)
);

-- Games/Matches
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    external_id TEXT UNIQUE,          -- External API game ID
    home_team_id TEXT REFERENCES options(id),
    away_team_id TEXT REFERENCES options(id),
    home_score INTEGER,
    away_score INTEGER,
    status TEXT,                      -- scheduled, in_progress, final
    scheduled_at INTEGER,
    metadata TEXT DEFAULT '{}',       -- JSON for additional game data
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Standings (calculated, materialized for performance)
CREATE TABLE IF NOT EXISTS standings (
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    points REAL DEFAULT 0,
    rank INTEGER,
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    PRIMARY KEY (event_id, user_id)
);

-- Sessions (backup to KV, D1 for queries)
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(slug);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_options_event ON options(event_id);
CREATE INDEX IF NOT EXISTS idx_selections_event_user ON selections(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_selections_option ON selections(option_id);
CREATE INDEX IF NOT EXISTS idx_games_event ON games(event_id);
CREATE INDEX IF NOT EXISTS idx_games_event_status ON games(event_id, status);
CREATE INDEX IF NOT EXISTS idx_games_external ON games(external_id);
CREATE INDEX IF NOT EXISTS idx_standings_event ON standings(event_id, wins DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
