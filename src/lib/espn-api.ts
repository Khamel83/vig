/**
 * ESPN Public API Integration
 * https://github.com/pseudo-r/Public-ESPN-API
 *
 * Fetches standings data directly from ESPN (no auth required)
 * Fallback to scraping ESPN.com if API fails
 */

// ESPN Team ID to Abbreviation mapping (synced with ESPN teams endpoint)
export const ESPN_TEAM_ABBREVS: Record<string, string> = {
  '1': 'ATL',   // Atlanta Hawks
  '2': 'BKN',   // Brooklyn Nets
  '3': 'NYK',   // New York Knicks
  '4': 'PHI',   // Philadelphia 76ers
  '5': 'TOR',   // Toronto Raptors
  '6': 'CHI',   // Chicago Bulls
  '7': 'CLE',   // Cleveland Cavaliers
  '8': 'DET',   // Detroit Pistons
  '9': 'IND',   // Indiana Pacers
  '10': 'MIL',  // Milwaukee Bucks
  '11': 'ATL',  // Atlanta Hawks (duplicate in ESPN, using ATL)
  '12': 'CHA',  // Charlotte Hornets
  '13': 'MIA',  // Miami Heat
  '14': 'ORL',  // Orlando Magic
  '15': 'WSH',  // Washington Wizards
  '16': 'DEN',  // Denver Nuggets
  '17': 'MIN',  // Minnesota Timberwolves
  '18': 'OKC',  // Oklahoma City Thunder
  '19': 'POR',  // Portland Trail Blazers
  '20': 'UTAH', // Utah Jazz
  '21': 'GS',   // Golden State Warriors
  '22': 'LAC',  // Los Angeles Clippers
  '23': 'LAL',  // Los Angeles Lakers
  '24': 'PHX',  // Phoenix Suns
  '25': 'SAC',  // Sacramento Kings
  '26': 'DAL',  // Dallas Mavericks
  '27': 'HOU',  // Houston Rockets
  '28': 'MEM',  // Memphis Grizzlies
  '29': 'NO',   // New Orleans Pelicans
  '30': 'SA',   // San Antonio Spurs
};

// Our internal abbreviations (from nba26_data.sql) to ESPN abbreviations
export const INTERNAL_TO_ESPN_ABBREV: Record<string, string> = {
  'ATL': 'ATL',
  'BKN': 'BKN',
  'NYK': 'NYK',
  'PHI': 'PHI',
  'TOR': 'TOR',
  'CHI': 'CHI',
  'CLE': 'CLE',
  'DET': 'DET',
  'IND': 'IND',
  'MIL': 'MIL',
  'CHA': 'CHA',
  'MIA': 'MIA',
  'ORL': 'ORL',
  'WSH': 'WSH',
  'DEN': 'DEN',
  'MIN': 'MIN',
  'OKC': 'OKC',
  'POR': 'POR',
  'UTAH': 'UTAH',
  'GS': 'GS',
  'LAC': 'LAC',
  'LAL': 'LAL',
  'PHX': 'PHX',
  'SAC': 'SAC',
  'DAL': 'DAL',
  'HOU': 'HOU',
  'MEM': 'MEM',
  'NO': 'NO',
  'SA': 'SA',
};

export interface ESPNStanding {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  wins: number;
  losses: number;
}

interface ESPNRecord {
  name: string;
  type: string;
  stats: Array<{
    name: string;
    type: string;
    value: number;
    displayValue: string;
  }>;
}

interface ESPNTeamStanding {
  team: {
    $ref: string;
  };
  records: ESPNRecord[];
}

interface ESPNStandingsResponse {
  standings: ESPNTeamStanding[];
}

/**
 * ESPN API client for fetching standings
 */
export class ESPNAPI {
  private readonly siteApiUrl = 'https://site.api.espn.com';
  private readonly coreApiUrl = 'https://sports.core.api.espn.com';

  /**
   * Get current NBA season year based on date
   * NBA season spans calendar years (e.g., 2025-26 season is in 2026)
   */
  private getNBASeasonYear(): number {
    const now = new Date();
    const month = now.getMonth();
    // NBA season starts in October, so if Jan-Sep, use current year
    // If Oct-Dec, the season started in previous calendar year but is current season
    // Actually ESPN uses the ending year for the season
    // 2025-26 season is stored as "2026" in ESPN
    if (month >= 9) { // October or later
      return now.getFullYear() + 1;
    }
    return now.getFullYear();
  }

  /**
   * Extract team ID from ESPN $ref URL
   * Example: "https://sports.core.api.espn.com/.../teams/3?..." -> "3"
   */
  private extractTeamId(ref: string): string {
    const match = ref.match(/\/teams\/(\d+)/);
    if (!match) {
      throw new Error(`Invalid team ref: ${ref}`);
    }
    return match[1];
  }

  /**
   * Get team abbreviation from ESPN team ID
   */
  private getTeamAbbr(espnTeamId: string): string {
    return ESPN_TEAM_ABBREVS[espnTeamId] || '';
  }

  /**
   * Fetch NBA teams from ESPN
   * Returns mapping of team ID to abbreviation
   */
  async fetchNBATeams(): Promise<Record<string, { id: string; abbr: string; name: string }>> {
    const url = `${this.siteApiUrl}/apis/site/v2/sports/basketball/nba/teams`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    const teams: Record<string, { id: string; abbr: string; name: string }> = {};

    for (const league of data.sports || []) {
      for (const leagueData of league.leagues || []) {
        for (const teamData of leagueData.teams || []) {
          const team = teamData.team;
          if (team && team.id && team.abbreviation) {
            teams[team.id] = {
              id: team.id,
              abbr: team.abbreviation,
              name: team.displayName || team.shortDisplayName,
            };
          }
        }
      }
    }

    return teams;
  }

  /**
   * Get the league standings group ID for NBA
   */
  private getStandingsUrl(): string {
    const seasonYear = this.getNBASeasonYear();
    // ESPN uses season type 2 for regular season
    // Group 7 is the overall league standings
    return `${this.coreApiUrl}/v2/sports/basketball/leagues/nba/seasons/${seasonYear}/types/2/groups/7/standings/0?lang=en&region=us`;
  }

  /**
   * Fetch NBA standings from ESPN API
   * Returns array of standings with team info and W-L records
   */
  async getNBAStandings(): Promise<ESPNStanding[]> {
    const url = this.getStandingsUrl();

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = (await response.json()) as ESPNStandingsResponse;
    const standings: ESPNStanding[] = [];

    // First, fetch team data to get names and abbreviations
    const teamMap = await this.fetchNBATeams();

    for (const teamStanding of data.standings || []) {
      const espnTeamId = this.extractTeamId(teamStanding.team.$ref);
      const teamInfo = teamMap[espnTeamId];

      if (!teamInfo) {
        console.warn(`No team info found for ESPN ID: ${espnTeamId}`);
        continue;
      }

      // Find the league standings record (type: 'leaguestandings')
      const leagueRecord = teamStanding.records.find(
        (r) => r.type === 'leaguestandings'
      );

      if (!leagueRecord) {
        console.warn(`No league standings record for team: ${teamInfo.abbr}`);
        continue;
      }

      // Extract wins and losses from stats
      const winsStat = leagueRecord.stats.find((s) => s.type === 'wins');
      const lossesStat = leagueRecord.stats.find((s) => s.type === 'losses');

      const wins = winsStat?.value ?? 0;
      const losses = lossesStat?.value ?? 0;

      standings.push({
        teamId: espnTeamId,
        teamName: teamInfo.name,
        teamAbbr: teamInfo.abbr,
        wins: Math.round(wins),
        losses: Math.round(losses),
      });
    }

    // Sort by wins descending
    standings.sort((a, b) => b.wins - a.wins || a.losses - b.losses);

    return standings;
  }

  /**
   * Fallback: Scrape NBA standings from ESPN.com
   * Uses simple regex to parse team records from HTML
   */
  async scrapeNBAStandings(): Promise<ESPNStanding[]> {
    const url = 'https://www.espn.com/nba/standings';

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN scrape error: ${response.status}`);
    }

    const html = await response.text();
    const standings: ESPNStanding[] = [];

    // ESPN standings page has a table with team abbreviations and records
    // Pattern: Team abbreviation followed by wins-losses
    // We'll parse the HTML to extract team data

    // Find all table rows with team data
    const tableRows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];

    for (const row of tableRows) {
      // Look for team abbreviation (3 letters like ATL, BOS, etc.)
      const abbrMatch = row.match(/[A-Z]{3}/);
      if (!abbrMatch) continue;

      const abbr = abbrMatch[0];
      if (!Object.values(INTERNAL_TO_ESPN_ABBREV).includes(abbr)) continue;

      // Look for record pattern like "37-9"
      const recordMatch = row.match(/(\d+)-(\d+)/);
      if (!recordMatch) continue;

      const wins = parseInt(recordMatch[1], 10);
      const losses = parseInt(recordMatch[2], 10);

      standings.push({
        teamId: abbr,
        teamName: abbr,
        teamAbbr: abbr,
        wins,
        losses,
      });
    }

    return standings;
  }

  /**
   * Get standings with automatic fallback
   * Tries API first, then falls back to scraping
   */
  async getNBAStandingsWithFallback(): Promise<{
    standings: ESPNStanding[];
    source: 'espn_api' | 'espn_scrape';
  }> {
    try {
      const standings = await this.getNBAStandings();
      return { standings, source: 'espn_api' };
    } catch (error) {
      console.warn('ESPN API failed, trying scrape fallback:', error);
      const standings = await this.scrapeNBAStandings();
      return { standings, source: 'espn_scrape' };
    }
  }
}

/**
 * Sync ESPN standings to D1 database
 */
export async function syncESPNStandings(
  db: import('@cloudflare/workers-types').D1Database,
  espnAPI: ESPNAPI,
  eventId: string
): Promise<{ synced: number; source: string }> {
  const { standings, source } = await espnAPI.getNBAStandingsWithFallback();

  let synced = 0;

  for (const standing of standings) {
    // Map ESPN abbreviation to internal team ID
    // First, we need to find the option by abbreviation
    const optionStmt = db.prepare(`
      SELECT id FROM options
      WHERE event_id = ? AND abbreviation = ?
    `);

    const optionResult = await optionStmt.bind(eventId, standing.teamAbbr).first<{ id: string }>();

    if (!optionResult) {
      // Skip teams not in this event
      continue;
    }

    // Upsert to espn_standings table
    const stmt = db.prepare(`
      INSERT INTO espn_standings (id, event_id, sport, team_id, team_name, team_abbr, wins, losses, sync_source, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(event_id, team_id) DO UPDATE SET
        team_name = excluded.team_name,
        team_abbr = excluded.team_abbr,
        wins = excluded.wins,
        losses = excluded.losses,
        sync_source = excluded.sync_source,
        synced_at = excluded.synced_at
    `);

    await stmt
      .bind(
        `${eventId}-${standing.teamId}`,
        eventId,
        'NBA',
        optionResult.id,
        standing.teamName,
        standing.teamAbbr,
        standing.wins,
        standing.losses,
        source,
        Math.floor(Date.now() / 1000)
      )
      .run();

    synced++;
  }

  return { synced, source };
}

/**
 * Update user standings from ESPN standings
 * Aggregates team records for each user
 */
export async function updateUserStandingsFromESPN(
  db: import('@cloudflare/workers-types').D1Database,
  eventId: string
): Promise<{ updated: number }> {
  // For each user, calculate their total wins/losses based on their team selections
  const usersStmt = db.prepare(`
    SELECT DISTINCT user_id FROM selections WHERE event_id = ?
  `);

  const usersResult = await usersStmt.bind(eventId).all<{ user_id: string }>();

  let updated = 0;

  for (const { user_id } of usersResult.results) {
    // Calculate total wins/losses for this user's teams
    const standingsStmt = db.prepare(`
      SELECT
        COALESCE(SUM(es.wins), 0) as total_wins,
        COALESCE(SUM(es.losses), 0) as total_losses
      FROM selections s
      JOIN espn_standings es ON s.option_id = es.team_id
      WHERE s.event_id = ? AND s.user_id = ? AND es.event_id = ?
    `);

    const result = await standingsStmt.bind(eventId, user_id, eventId).first<{
      total_wins: number;
      total_losses: number;
    }>();

    if (result) {
      // Update standings table
      const updateStmt = db.prepare(`
        INSERT INTO standings (event_id, user_id, wins, losses, points, rank, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id, user_id) DO UPDATE SET
          wins = excluded.wins,
          losses = excluded.losses,
          points = excluded.points,
          updated_at = excluded.updated_at
      `);

      const winPercentage = result.total_wins + result.total_losses > 0
        ? result.total_wins / (result.total_wins + result.total_losses)
        : 0;

      await updateStmt
        .bind(
          eventId,
          user_id,
          result.total_wins,
          result.total_losses,
          winPercentage,
          null,
          Math.floor(Date.now() / 1000)
        )
        .run();

      updated++;
    }
  }

  // Update ranks
  const rankStmt = db.prepare(`
    WITH ranked AS (
      SELECT user_id,
             ROW_NUMBER() OVER (ORDER BY points DESC, wins DESC) as rank
      FROM standings
      WHERE event_id = ?
    )
    UPDATE standings
    SET rank = (
      SELECT rank FROM ranked WHERE ranked.user_id = standings.user_id
    )
    WHERE event_id = ?
  `);

  await rankStmt.bind(eventId, eventId).run();

  return { updated };
}

/**
 * Sport schedules for sync timing
 */
export const SPORT_SCHEDULES = {
  NBA: {
    season: { start: '2025-10-20', end: '2026-04-15' },
    gameHours: { start: 19, end: 2 }, // 7pm - 2am ET
    timezone: 'America/New_York',
  },
  // Future: NFL, MLB, NHL, Soccer, F1
} as const;

/**
 * Check if we should sync standings for a sport
 * Returns true if:
 * - In season AND (during game hours OR 2am ET)
 */
export function shouldSyncStandings(sport: keyof typeof SPORT_SCHEDULES): boolean {
  const schedule = SPORT_SCHEDULES[sport];
  if (!schedule) return false;

  const now = new Date();
  const seasonStart = new Date(schedule.season.start);
  const seasonEnd = new Date(schedule.season.end);

  // Check if in season
  if (now < seasonStart || now > seasonEnd) return false;

  // Get current ET time
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: schedule.timezone }));
  const hour = etNow.getHours();

  // Check if in game window or 2am (nightly sync)
  const inGameWindow = hour >= schedule.gameHours.start || hour <= schedule.gameHours.end;

  return inGameWindow || hour === 2;
}
