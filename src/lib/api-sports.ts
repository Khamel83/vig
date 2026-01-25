/**
 * API-Sports.io Integration
 * https://api-sports.io/documentation
 *
 * Free tier: 100 requests/day
 * Covers: NBA, NFL, MLB, NHL, Soccer, F1, and more
 */

const API_KEY = '8ded0deff2fc71b61bf3b6ff8da271ae';
const BASE_URL = 'https://v3..api-sports.io';

export interface ApiSportsStanding {
  teamId: string;
  teamName: string;
  teamAbbr: string;
  wins: number;
  losses: number;
  points?: number;  // For soccer/F1
}

/**
 * API-Sports client
 */
export class ApiSportsClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || API_KEY;
    this.baseUrl = BASE_URL;
  }

  /**
   * Make API request with rate limit handling
   */
  private async request(endpoint: string, params?: Record<string, string>): Promise<any> {
    const url = new URL(endpoint, this.baseUrl);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        'x-apisports-key': this.apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get NBA standings
   * Season: 2025-26 (use 2025 for API)
   */
  async getNBAStandings(season = 2025): Promise<ApiSportsStanding[]> {
    const data = await this.request('/standings', {
      league: '12',  // NBA league ID
      season: season.toString(),
    });

    const standings: ApiSportsStanding[] = [];

    for (const item of data.response || []) {
      for (const team of item) {
        standings.push({
          teamId: team.team.id.toString(),
          teamName: team.team.name,
          teamAbbr: this.getNBATeamAbbr(team.team.name),
          wins: team.games.win.total,
          losses: team.games.lose.total,
        });
      }
    }

    return standings;
  }

  /**
   * Get NFL standings
   */
  async getNFLStandings(season = 2025): Promise<ApiSportsStanding[]> {
    const data = await this.request('/standings', {
      league: '1',   // NFL league ID
      season: season.toString(),
    });

    const standings: ApiSportsStanding[] = [];

    for (const item of data.response || []) {
      for (const team of item) {
        standings.push({
          teamId: team.team.id.toString(),
          teamName: team.team.name,
          teamAbbr: this.getNFLTeamAbbr(team.team.name),
          wins: team.games.win.total,
          losses: team.games.lose.total,
          ties: team.games.draw.total,
        });
      }
    }

    return standings;
  }

  /**
   * Get MLB standings
   */
  async getMLBStandings(season = 2025): Promise<ApiSportsStanding[]> {
    const data = await this.request('/standings', {
      league: '1',   // MLB league ID
      season: season.toString(),
    });

    const standings: ApiSportsStanding[] = [];

    for (const item of data.response || []) {
      for (const team of item) {
        standings.push({
          teamId: team.team.id.toString(),
          teamName: team.team.name,
          teamAbbr: this.getMLBTeamAbbr(team.team.name),
          wins: team.games.win.total,
          losses: team.games.lose.total,
        });
      }
    }

    return standings;
  }

  /**
   * Get NHL standings
   */
  async getNHLStandings(season = 2025): Promise<ApiSportsStanding[]> {
    const data = await this.request('/standings', {
      league: '1',   // NHL league ID
      season: season.toString(),
    });

    const standings: ApiSportsStanding[] = [];

    for (const item of data.response || []) {
      for (const team of item) {
        standings.push({
          teamId: team.team.id.toString(),
          teamName: team.team.name,
          teamAbbr: this.getNHLTeamAbbr(team.team.name),
          wins: team.games.win.total,
          losses: team.games.lose.total,
        });
      }
    }

    return standings;
  }

  /**
   * Get F1 standings (driver standings)
   */
  async getF1Standings(season = 2025): Promise<ApiSportsStanding[]> {
    const data = await this.request('/standings', {
      league: '1',   // F1 league ID
      season: season.toString(),
    });

    const standings: ApiSportsStanding[] = [];

    for (const driver of data.response || []) {
      standings.push({
        teamId: driver.driver.id.toString(),
        teamName: driver.driver.name,
        teamAbbr: driver.driver.code || 'UNK',
        wins: 0,
        losses: 0,
        points: driver.points,
      });
    }

    return standings;
  }

  /**
   * Get soccer standings (World Cup, etc.)
   */
  async getSoccerStandings(league: number, season: number): Promise<ApiSportsStanding[]> {
    const data = await this.request('/standings', {
      league: league.toString(),
      season: season.toString(),
    });

    const standings: ApiSportsStanding[] = [];

    for (const item of data.response || []) {
      for (const team of item) {
        standings.push({
          teamId: team.team.id.toString(),
          teamName: team.team.name,
          teamAbbr: team.team.code || 'UNK',
          wins: team.all.win,
          losses: team.all.lose,
          points: team.points,
        });
      }
    }

    return standings;
  }

  /**
   * Map NBA team name to abbreviation
   */
  private getNBATeamAbbr(name: string): string {
    const map: Record<string, string> = {
      'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
      'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
      'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
      'Golden State Warriors': 'GS', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
      'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM',
      'Miami Heat': 'MIA', 'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN',
      'New Orleans Pelicans': 'NO', 'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC',
      'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
      'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SA',
      'Toronto Raptors': 'TOR', 'Utah Jazz': 'UTAH', 'Washington Wizards': 'WSH',
    };
    return map[name] || name.substring(0, 3).toUpperCase();
  }

  /**
   * Map NFL team name to abbreviation
   */
  private getNFLTeamAbbr(name: string): string {
    // Similar mapping for NFL
    return name.substring(0, 3).toUpperCase();
  }

  /**
   * Map MLB team name to abbreviation
   */
  private getMLBTeamAbbr(name: string): string {
    // Similar mapping for MLB
    return name.substring(0, 3).toUpperCase();
  }

  /**
   * Map NHL team name to abbreviation
   */
  private getNHLTeamAbbr(name: string): string {
    // Similar mapping for NHL
    return name.substring(0, 3).toUpperCase();
  }
}

/**
 * Sync standings from API-Sports to D1
 */
export async function syncApiSportsStandings(
  db: import('@cloudflare/workers-types').D1Database,
  client: ApiSportsClient,
  eventId: string,
  sport: string,
  season?: number
): Promise<{ synced: number; source: string }> {
  let standings: ApiSportsStanding[] = [];

  switch (sport) {
    case 'NBA':
      standings = await client.getNBAStandings(season);
      break;
    case 'NFL':
      standings = await client.getNFLStandings(season);
      break;
    case 'MLB':
      standings = await client.getMLBStandings(season);
      break;
    case 'NHL':
      standings = await client.getNHLStandings(season);
      break;
    case 'F1':
      standings = await client.getF1Standings(season);
      break;
    default:
      throw new Error(`Unsupported sport: ${sport}`);
  }

  let synced = 0;

  for (const standing of standings) {
    // Map abbreviation to our team ID
    const optionStmt = db.prepare(`
      SELECT id FROM options
      WHERE event_id = ? AND abbreviation = ?
    `);

    const optionResult = await optionStmt.bind(eventId, standing.teamAbbr).first<{ id: string }>();

    if (!optionResult) continue;

    // Upsert to espn_standings (reusing the table)
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
        optionResult.id,
        standing.teamName,
        standing.teamAbbr,
        standing.wins,
        standing.losses,
        'api-sports',
        Math.floor(Date.now() / 1000)
      )
      .run();

    synced++;
  }

  return { synced, source: 'api-sports' };
}
