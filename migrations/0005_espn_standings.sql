-- ESPN Standings Table
-- Stores standings data fetched from ESPN API
-- Separated from game-by-game data for direct standings queries

CREATE TABLE IF NOT EXISTS espn_standings (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sport TEXT NOT NULL,                    -- 'NBA', 'NFL', 'MLB', 'NHL', etc.
    team_id TEXT NOT NULL REFERENCES options(id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    team_abbr TEXT NOT NULL,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    sync_source TEXT NOT NULL,              -- 'espn_api' or 'espn_scrape'
    synced_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    UNIQUE(event_id, team_id)
);

-- Indexes for ESPN standings queries
CREATE INDEX IF NOT EXISTS idx_espn_standings_event ON espn_standings(event_id);
CREATE INDEX IF NOT EXISTS idx_espn_standings_sport ON espn_standings(sport);
CREATE INDEX IF NOT EXISTS idx_espn_standings_team ON espn_standings(team_id);
CREATE INDEX IF NOT EXISTS idx_espn_standings_synced_at ON espn_standings(synced_at);
