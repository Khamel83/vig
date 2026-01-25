/**
 * Simple Standings Scraper
 * Scrapes ESPN standings pages for NBA, NFL, MLB, NHL, F1, Soccer
 *
 * URLs:
 * - https://www.espn.com/nba/standings
 * - https://www.espn.com/nfl/standings
 * - https://www.espn.com/f1/standings
 * - https://www.espn.com/mlb/standings
 * - https://www.espn.com/soccer/table/_/league/fifa.world
 */

export interface Sc Standing {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  wins: number;
  losses: number;
  ties?: number;
  points?: number;  // For F1/soccer
}

/**
 * Team abbreviation mappings for matching scraped data to our database
 */
const TEAM_ABBREVS: Record<string, string> = {
  'ATL': 'nba26-atl', 'BOS': 'nba26-bos', 'BKN': 'nba26-bkn', 'CHA': 'nba26-cha',
  'CHI': 'nba26-chi', 'CLE': 'nba26-cle', 'DAL': 'nba26-dal', 'DEN': 'nba26-den',
  'DET': 'nba26-det', 'GS': 'nba26-gs', 'HOU': 'nba26-hou', 'IND': 'nba26-ind',
  'LAC': 'nba26-lac', 'LAL': 'nba26-lal', 'MEM': 'nba26-mem', 'MIA': 'nba26-mia',
  'MIL': 'nba26-mil', 'MIN': 'nba26-min', 'NO': 'nba26-no', 'NYK': 'nba26-nyk',
  'OKC': 'nba26-okc', 'ORL': 'nba26-orl', 'PHI': 'nba26-phi', 'PHX': 'nba26-phx',
  'POR': 'nba26-por', 'SA': 'nba26-sa', 'SAC': 'nba26-sac', 'TOR': 'nba26-tor',
  'UTAH': 'nba26-utah', 'WSH': 'nba26-wsh',
};

/**
 * Simple HTML scraper for ESPN standings
 * Uses regex to parse team records from HTML
 */
export class StandingsScraper {
  /**
   * Scrape NBA standings from ESPN
   */
  async scrapeNBA(): Promise<ScStanding[]> {
    const url = 'https://www.espn.com/nba/standings';
    const html = await this.fetchHTML(url);
    return this.parseNBAStandings(html);
  }

  /**
   * Scrape NFL standings from ESPN
   */
  async scrapeNFL(): Promise<ScStanding[]> {
    const url = 'https://www.espn.com/nfl/standings';
    const html = await this.fetchHTML(url);
    return this.parseNFLStandings(html);
  }

  /**
   * Scrape MLB standings from ESPN
   */
  async scrapeMLB(): Promise<ScStanding[]> {
    const url = 'https://www.espn.com/mlb/standings';
    const html = await this.fetchHTML(url);
    return this.parseMLBStandings(html);
  }

  /**
   * Scrape F1 standings from ESPN
   */
  async scrapeF1(): Promise<ScStanding[]> {
    const url = 'https://www.espn.com/f1/standings';
    const html = await this.fetchHTML(url);
    return this.parseF1Standings(html);
  }

  /**
   * Scrape Soccer standings from ESPN
   */
  async scrapeSoccer(league: string): Promise<ScStanding[]> {
    const url = `https://www.espn.com/soccer/table/_/league/${league}`;
    const html = await this.fetchHTML(url);
    return this.parseSoccerStandings(html);
  }

  /**
   * Fetch HTML from URL
   */
  private async fetchHTML(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return response.text();
  }

  /**
   * Parse NBA standings from HTML
   * ESPN NBA page structure: table with team name and W-L record
   */
  private parseNBAStandings(html: string): ScStanding[] {
    const standings: ScStanding[] = [];

    // Find the standings table
    // ESPN uses data attributes and specific classes
    const teamRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(teamRegex) || [];

    for (const row of rows) {
      // Look for team abbreviation (3 uppercase letters)
      const abbrMatch = row.match(/[A-Z]{3}/);
      if (!abbrMatch) continue;

      const abbr = abbrMatch[0];
      if (!TEAM_ABBREVS[abbr]) continue;

      // Look for W-L record pattern like "37-9"
      const recordMatch = row.match(/(\d+)-(\d+)/);
      if (!recordMatch) continue;

      const wins = parseInt(recordMatch[1], 10);
      const losses = parseInt(recordMatch[2], 10);

      standings.push({
        teamId: TEAM_ABBREVS[abbr],
        teamName: abbr,
        teamAbbr: abbr,
        wins,
        losses,
      });
    }

    return standings;
  }

  /**
   * Parse NFL standings from HTML
   */
  private parseNFLStandings(html: string): ScStanding[] {
    // Similar to NBA but includes ties
    const standings: ScStanding[] = [];
    const teamRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(teamRegex) || [];

    for (const row of rows) {
      // Look for team abbreviation
      const abbrMatch = row.match(/[A-Z]{2,4}/);
      if (!abbrMatch) continue;

      const abbr = abbrMatch[0];

      // Look for W-L-T record pattern like "12-5-0"
      const recordMatch = row.match(/(\d+)-(\d+)-(\d+)/);
      if (!recordMatch) continue;

      const wins = parseInt(recordMatch[1], 10);
      const losses = parseInt(recordMatch[2], 10);
      const ties = parseInt(recordMatch[3], 10);

      standings.push({
        teamId: abbr,
        teamName: abbr,
        teamAbbr: abbr,
        wins,
        losses,
        ties,
      });
    }

    return standings;
  }

  /**
   * Parse MLB standings from HTML
   */
  private parseMLBStandings(html: string): ScStanding[] {
    // Similar to NBA
    return this.parseNBAStandings(html);
  }

  /**
   * Parse F1 standings from HTML
   * F1 uses points instead of W-L
   */
  private parseF1Standings(html: string): ScStanding[] {
    const standings: ScStanding[] = [];

    // F1 uses driver name and points
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    for (const row of rows) {
      // Look for driver name
      const nameMatch = row.match(/>([A-Z][a-z]+ [A-Z][a-z]+)</);
      if (!nameMatch) continue;

      const name = nameMatch[1];

      // Look for points
      const pointsMatch = row.match(/>(\d+)<\/td>/);
      if (!pointsMatch) continue;

      const points = parseInt(pointsMatch[1], 10);

      standings.push({
        teamId: name.toLowerCase().replace(/\s/g, '-'),
        teamName: name,
        teamAbbr: name.substring(0, 3).toUpperCase(),
        wins: 0,
        losses: 0,
        points,
      });
    }

    return standings;
  }

  /**
   * Parse Soccer standings from HTML
   * Soccer uses points, W-D-L
   */
  private parseSoccerStandings(html: string): ScStanding[] {
    const standings: ScStanding[] = [];

    // Soccer table: team name, played, W-D-L, points
    const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
    const rows = html.match(rowRegex) || [];

    for (const row of rows) {
      // Look for team name
      const nameMatch = row.match(/>([A-Z][a-z]+ [A-Z][a-z]+)</);
      if (!nameMatch) continue;

      const name = nameMatch[1];

      // Look for W-D-L record
      const recordMatch = row.match(/(\d+)-(\d+)-(\d+)/);
      if (!recordMatch) continue;

      const wins = parseInt(recordMatch[1], 10);
      const draws = parseInt(recordMatch[2], 10);
      const losses = parseInt(recordMatch[3], 10);

      // Look for points
      const pointsMatch = row.match(/pts[^>]*>(\d+)/);
      if (!pointsMatch) continue;

      const points = parseInt(pointsMatch[1], 10);

      standings.push({
        teamId: name.toLowerCase().replace(/\s/g, '-'),
        teamName: name,
        teamAbbr: name.substring(0, 3).toUpperCase(),
        wins,
        losses,
        points,
      });
    }

    return standings;
  }
}

/**
 * Sync scraped standings to D1 database
 */
export async function syncScrapedStandings(
  db: import('@cloudflare/workers-types').D1Database,
  standings: ScStanding[],
  eventId: string,
  sport: string
): Promise<{ synced: number; source: string }> {
  let synced = 0;

  for (const standing of standings) {
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
        sport,
        standing.teamId,
        standing.teamName,
        standing.teamAbbr,
        standing.wins,
        standing.losses,
        'espn_scrape',
        Math.floor(Date.now() / 1000)
      )
      .run();

    synced++;
  }

  return { synced, source: 'espn_scrape' };
}

/**
 * Quick test - scrape NBA standings and return as JSON
 */
export async function testScrapeNBA(): Promise<ScStanding[]> {
  const scraper = new StandingsScraper();
  return await scraper.scrapeNBA();
}
