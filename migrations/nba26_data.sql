-- NBA 2026 Pool Data Migration
-- Snake draft team assignments for 10 players, 3 teams each
-- Using unique IDs to avoid conflicts with existing NFL options

-- Create the NBA26 event
INSERT INTO events (id, slug, name, description, sport, status, pool_type, max_selections, starts_at, ends_at, created_by, config)
VALUES (
  'nba26-event',
  'nba26',
  'NBA 2026 Pool',
  'Pick teams and count their wins - snake draft',
  'NBA',
  'completed',
  'wins',
  3,
  strftime('%s', 'now') - 86400,
  strftime('%s', 'now') + 31536000,
  NULL,
  '{}'
);

-- Create 10 users
INSERT INTO users (id, email, password_hash, name, is_admin, created_at) VALUES
  ('user-adam', 'adam+nba26@temp.com', '', 'adam', 0, strftime('%s', 'now')),
  ('user-whet', 'whet+nba26@temp.com', '', 'whet', 0, strftime('%s', 'now')),
  ('user-mzapp', 'mzapp+nba26@temp.com', '', 'mzapp', 0, strftime('%s', 'now')),
  ('user-omar', 'omar+nba26@temp.com', '', 'omar', 0, strftime('%s', 'now')),
  ('user-pete', 'pete+nba26@temp.com', '', 'pete', 0, strftime('%s', 'now')),
  ('user-ben', 'ben+nba26@temp.com', '', 'ben', 0, strftime('%s', 'now')),
  ('user-carter', 'carter+nba26@temp.com', '', 'carter', 0, strftime('%s', 'now')),
  ('user-eric', 'eric+nba26@temp.com', '', 'eric', 0, strftime('%s', 'now')),
  ('user-mintz', 'mintz+nba26@temp.com', '', 'mintz', 0, strftime('%s', 'now')),
  ('user-mcard', 'mcard+nba26@temp.com', '', 'mcard', 0, strftime('%s', 'now'))
ON CONFLICT(email) DO NOTHING;

-- Create 30 NBA team options (using TheRundown external_id)
-- Using nba26- prefix to avoid ID conflicts with NFL options
INSERT INTO options (id, event_id, external_id, name, abbreviation, logo_url, metadata, created_at) VALUES
  ('nba26-okc', 'nba26-event', '18', 'Oklahoma City Thunder', 'OKC', NULL, '{}', strftime('%s', 'now')),
  ('nba26-cle', 'nba26-event', '7', 'Cleveland Cavaliers', 'CLE', NULL, '{}', strftime('%s', 'now')),
  ('nba26-nyk', 'nba26-event', '3', 'New York Knicks', 'NYK', NULL, '{}', strftime('%s', 'now')),
  ('nba26-den', 'nba26-event', '16', 'Denver Nuggets', 'DEN', NULL, '{}', strftime('%s', 'now')),
  ('nba26-hou', 'nba26-event', '27', 'Houston Rockets', 'HOU', NULL, '{}', strftime('%s', 'now')),
  ('nba26-orl', 'nba26-event', '14', 'Orlando Magic', 'ORL', NULL, '{}', strftime('%s', 'now')),
  ('nba26-gs', 'nba26-event', '21', 'Golden State Warriors', 'GS', NULL, '{}', strftime('%s', 'now')),
  ('nba26-lac', 'nba26-event', '22', 'Los Angeles Clippers', 'LAC', NULL, '{}', strftime('%s', 'now')),
  ('nba26-min', 'nba26-event', '17', 'Minnesota Timberwolves', 'MIN', NULL, '{}', strftime('%s', 'now')),
  ('nba26-det', 'nba26-event', '8', 'Detroit Pistons', 'DET', NULL, '{}', strftime('%s', 'now')),
  ('nba26-atl', 'nba26-event', '11', 'Atlanta Hawks', 'ATL', NULL, '{}', strftime('%s', 'now')),
  ('nba26-sa', 'nba26-event', '30', 'San Antonio Spurs', 'SA', NULL, '{}', strftime('%s', 'now')),
  ('nba26-dal', 'nba26-event', '26', 'Dallas Mavericks', 'DAL', NULL, '{}', strftime('%s', 'now')),
  ('nba26-lal', 'nba26-event', '23', 'Los Angeles Lakers', 'LAL', NULL, '{}', strftime('%s', 'now')),
  ('nba26-mil', 'nba26-event', '10', 'Milwaukee Bucks', 'MIL', NULL, '{}', strftime('%s', 'now')),
  ('nba26-bos', 'nba26-event', '1', 'Boston Celtics', 'BOS', NULL, '{}', strftime('%s', 'now')),
  ('nba26-mem', 'nba26-event', '28', 'Memphis Grizzlies', 'MEM', NULL, '{}', strftime('%s', 'now')),
  ('nba26-phi', 'nba26-event', '4', 'Philadelphia 76ers', 'PHI', NULL, '{}', strftime('%s', 'now')),
  ('nba26-ind', 'nba26-event', '9', 'Indiana Pacers', 'IND', NULL, '{}', strftime('%s', 'now')),
  ('nba26-tor', 'nba26-event', '5', 'Toronto Raptors', 'TOR', NULL, '{}', strftime('%s', 'now')),
  ('nba26-mia', 'nba26-event', '13', 'Miami Heat', 'MIA', NULL, '{}', strftime('%s', 'now')),
  ('nba26-sac', 'nba26-event', '25', 'Sacramento Kings', 'SAC', NULL, '{}', strftime('%s', 'now')),
  ('nba26-chi', 'nba26-event', '6', 'Chicago Bulls', 'CHI', NULL, '{}', strftime('%s', 'now')),
  ('nba26-cha', 'nba26-event', '12', 'Charlotte Hornets', 'CHA', NULL, '{}', strftime('%s', 'now')),
  ('nba26-por', 'nba26-event', '19', 'Portland Trail Blazers', 'POR', NULL, '{}', strftime('%s', 'now')),
  ('nba26-no', 'nba26-event', '29', 'New Orleans Pelicans', 'NO', NULL, '{}', strftime('%s', 'now')),
  ('nba26-phx', 'nba26-event', '24', 'Phoenix Suns', 'PHX', NULL, '{}', strftime('%s', 'now')),
  ('nba26-utah', 'nba26-event', '20', 'Utah Jazz', 'UTAH', NULL, '{}', strftime('%s', 'now')),
  ('nba26-bkn', 'nba26-event', '2', 'Brooklyn Nets', 'BKN', NULL, '{}', strftime('%s', 'now')),
  ('nba26-wsh', 'nba26-event', '15', 'Washington Wizards', 'WSH', NULL, '{}', strftime('%s', 'now'))
ON CONFLICT(id) DO NOTHING;

-- Create selections (30 team assignments based on snake draft order)
-- Round 1
INSERT INTO selections (id, event_id, user_id, option_id, prediction_data, created_at) VALUES
  ('sel-1', 'nba26-event', 'user-adam', 'nba26-okc', '{}', strftime('%s', 'now')),
  ('sel-2', 'nba26-event', 'user-whet', 'nba26-cle', '{}', strftime('%s', 'now')),
  ('sel-3', 'nba26-event', 'user-mzapp', 'nba26-nyk', '{}', strftime('%s', 'now')),
  ('sel-4', 'nba26-event', 'user-omar', 'nba26-den', '{}', strftime('%s', 'now')),
  ('sel-5', 'nba26-event', 'user-pete', 'nba26-hou', '{}', strftime('%s', 'now')),
  ('sel-6', 'nba26-event', 'user-ben', 'nba26-orl', '{}', strftime('%s', 'now')),
  ('sel-7', 'nba26-event', 'user-carter', 'nba26-gs', '{}', strftime('%s', 'now')),
  ('sel-8', 'nba26-event', 'user-eric', 'nba26-lac', '{}', strftime('%s', 'now')),
  ('sel-9', 'nba26-event', 'user-mintz', 'nba26-min', '{}', strftime('%s', 'now')),
  ('sel-10', 'nba26-event', 'user-mcard', 'nba26-det', '{}', strftime('%s', 'now'))
ON CONFLICT(id) DO NOTHING;

-- Round 2 (snake order reversed)
INSERT INTO selections (id, event_id, user_id, option_id, prediction_data, created_at) VALUES
  ('sel-11', 'nba26-event', 'user-carter', 'nba26-atl', '{}', strftime('%s', 'now')),
  ('sel-12', 'nba26-event', 'user-mcard', 'nba26-sa', '{}', strftime('%s', 'now')),
  ('sel-13', 'nba26-event', 'user-mzapp', 'nba26-dal', '{}', strftime('%s', 'now')),
  ('sel-14', 'nba26-event', 'user-mintz', 'nba26-lal', '{}', strftime('%s', 'now')),
  ('sel-15', 'nba26-event', 'user-pete', 'nba26-mil', '{}', strftime('%s', 'now')),
  ('sel-16', 'nba26-event', 'user-whet', 'nba26-bos', '{}', strftime('%s', 'now')),
  ('sel-17', 'nba26-event', 'user-eric', 'nba26-mem', '{}', strftime('%s', 'now')),
  ('sel-18', 'nba26-event', 'user-omar', 'nba26-phi', '{}', strftime('%s', 'now')),
  ('sel-19', 'nba26-event', 'user-ben', 'nba26-ind', '{}', strftime('%s', 'now')),
  ('sel-20', 'nba26-event', 'user-adam', 'nba26-tor', '{}', strftime('%s', 'now'))
ON CONFLICT(id) DO NOTHING;

-- Round 3
INSERT INTO selections (id, event_id, user_id, option_id, prediction_data, created_at) VALUES
  ('sel-21', 'nba26-event', 'user-eric', 'nba26-mia', '{}', strftime('%s', 'now')),
  ('sel-22', 'nba26-event', 'user-ben', 'nba26-sac', '{}', strftime('%s', 'now')),
  ('sel-23', 'nba26-event', 'user-mintz', 'nba26-chi', '{}', strftime('%s', 'now')),
  ('sel-24', 'nba26-event', 'user-mcard', 'nba26-cha', '{}', strftime('%s', 'now')),
  ('sel-25', 'nba26-event', 'user-omar', 'nba26-por', '{}', strftime('%s', 'now')),
  ('sel-26', 'nba26-event', 'user-adam', 'nba26-no', '{}', strftime('%s', 'now')),
  ('sel-27', 'nba26-event', 'user-pete', 'nba26-phx', '{}', strftime('%s', 'now')),
  ('sel-28', 'nba26-event', 'user-carter', 'nba26-utah', '{}', strftime('%s', 'now')),
  ('sel-29', 'nba26-event', 'user-whet', 'nba26-bkn', '{}', strftime('%s', 'now')),
  ('sel-30', 'nba26-event', 'user-mzapp', 'nba26-wsh', '{}', strftime('%s', 'now'))
ON CONFLICT(id) DO NOTHING;

-- Initialize standings (placeholder - will be updated by actual games)
INSERT INTO standings (event_id, user_id, wins, losses, points, rank, updated_at) VALUES
  ('nba26-event', 'user-adam', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-whet', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-mzapp', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-omar', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-pete', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-ben', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-carter', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-eric', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-mintz', 0, 0, 0, NULL, strftime('%s', 'now')),
  ('nba26-event', 'user-mcard', 0, 0, 0, NULL, strftime('%s', 'now'))
ON CONFLICT(event_id, user_id) DO NOTHING;
