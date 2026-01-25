# ESPN Public API Documentation

Source: https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b

ESPN's hidden API endpoints - no authentication required.

## Football

### College Football
- **Latest News**: `http://site.api.espn.com/apis/site/v2/sports/football/college-football/news`
- **Latest Scores**: `http://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard`
  - Query params: `calendar`='blacklist', `dates`=YYYYMMDD
- **Game Information**: `http://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=:gameId`
- **Team Information**: `http://site.api.espn.com/apis/site/v2/sports/football/college-football/teams/:team`
- **Rankings**: `http://site.api.espn.com/apis/site/v2/sports/football/college-football/rankings`

### NFL
- **Scores**: `http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- **News**: `http://site.api.espn.com/apis/site/v2/sports/football/nfl/news`
- **All Teams**: `http://site.api.espn.com/apis/site/v2/sports/football/nfl/teams`
- **Specific Team**: `http://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/:team`

## Baseball

### MLB
- **Scores**: `http://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard`
- **News**: `http://site.api.espn.com/apis/site/v2/sports/baseball/mlb/news`
- **All Teams**: `http://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams`
- **Specific Team**: `http://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/:team`

### College Baseball
- **Scores**: `https://site.api.espn.com/apis/site/v2/sports/baseball/college-baseball/scoreboard`

## Hockey

### NHL
- **Scores**: `http://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard`
- **News**: `http://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news`
- **All Teams**: `http://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams`
- **Specific Team**: `http://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams/:team`

## Basketball

### NBA
- **Scores**: `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`
- **News**: `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/news`
- **All Teams**: `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams`
- **Specific Team**: `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/:team`
- **Standings**: `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/{year}/types/2/groups/7/standings/0?lang=en&region=us`
  - `year`: Season ending year (e.g., 2026 for 2025-26 season)
  - `types/2`: Regular season
  - `groups/7`: Overall standings

### WNBA
- **Scores**: `http://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard`
- **News**: `http://site.api.espn.com/apis/site/v2/sports/basketball/wnba/news`
- **All Teams**: `http://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams`
- **Specific Team**: `http://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/:team`

### Women's College Basketball
- **Scores**: `http://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/scoreboard`
- **News**: `http://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/news`
- **All Teams**: `http://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams`

### Men's College Basketball
- **Scores**: `http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`
  - Add `groups=100` or higher to get all games
  - Add `limit=365` to ensure every game is returned
- **News**: `http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/news`
- **All Teams**: `http://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams`

## Soccer

### General
- **Scores**: `http://site.api.espn.com/apis/site/v2/sports/soccer/:league/scoreboard`
  - `league`: League abbreviation (e.g., `eng.1` for EPL, `usa.1` for MLS)
- **All Soccer**: `http://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard`
- **Latest News**: `http://site.api.espn.com/apis/site/v2/sports/soccer/:league/news`
- **List of Teams**: `http://site.api.espn.com/apis/site/v2/sports/soccer/:league/teams`
- **Team Schedule (all competitions)**: `http://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/:id/schedule`
- **Team Fixtures**: `http://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/:id/schedule?fixture=true`
- **Team Injuries**: `http://sports.core.api.espn.com/v2/sports/soccer/leagues/:league/teams/:id/injuries?lang=en&region=us`

### Common League Codes
- `eng.1`: English Premier League
- `usa.1`: MLS
- `esp.1`: La Liga
- `ita.1`: Serie A
- `ger.1`: Bundesliga
- `fra.1`: Ligue 1

## Notes

- These are undocumented public APIs - use responsibly
- No authentication required for most endpoints
- Be respectful with rate limiting
- Endpoints may change without notice
- For basketball and other non-football sports, scoreboard is date-based, not week-based
