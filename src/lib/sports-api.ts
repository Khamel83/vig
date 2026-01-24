/**
 * TheRundown Sports API Integration
 * https://therundown.io/api
 *
 * Free tier: 1,000 requests/month
 * WebSocket for real-time: wss://therundown.io/api/v1/ws
 */

export interface Team {
  team_id: number;
  name: string;
  mascot: string;
  abbreviation: string;
  conference_id: number;
  division_id: number;
  ranking: number;
  record: string;
  is_away: boolean;
  is_home: boolean;
}

export interface Game {
  event_id: string;
  event_uuid: string;
  sport_id: number;
  event_date: string;
  rotation_number_away: number;
  rotation_number_home: number;
  score: {
    event_id: string;
    event_status: string;
    score_away: number;
    score_home: number;
    winner_away: number;
    winner_home: number;
    score_away_by_period: number[];
    score_home_by_period: number[];
    venue_name: string;
    venue_location: string;
    game_clock: number;
    display_clock: string;
    game_period: number;
    broadcast: string;
    event_status_detail: string;
    updated_at: string;
  };
  teams: Team[];
  teams_normalized: Array<{
    team_id: number;
    name: string;
    mascot: string;
    abbreviation: string;
    is_away: boolean;
    is_home: boolean;
  }>;
  schedule: {
    season_type: string;
    season_year: number;
    event_name: string;
    attendance: string;
  };
}

export interface EventsResponse {
  meta: {
    delta_last_id: string;
  };
  events: Game[];
}

// Sport IDs from TheRundown
export const SPORT_IDS = {
  NFL: 2,
  NBA: 4,
  MLB: 3,
  NHL: 6,
  NCAA_FB: 1,
  NCAA_BB: 5,
} as const;

const API_BASE = 'https://therundown-therundown-v1.p.rapidapi.com';

/**
 * TheRundown API client
 */
export class SportsAPI {
  private apiKey: string;
  private headers: HeadersInit;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.headers = {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'therundown-therundown-v1.p.rapidapi.com',
    };
  }

  /**
   * Get events for a specific sport and date
   */
  async getEvents(sportId: number, date?: string): Promise<Game[]> {
    const dateStr = date || new Date().toISOString().split('T')[0];
    const url = `${API_BASE}/sports/${sportId}/events/${dateStr}`;

    const response = await fetch(url, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`TheRundown API error: ${response.status}`);
    }

    const data = (await response.json()) as EventsResponse;
    return data.events || [];
  }

  /**
   * Get events by delta (changes since last fetch)
   */
  async getEventsDelta(sportId: number, lastId: string): Promise<EventsResponse> {
    const url = `${API_BASE}/sports/${sportId}/events/delta?last_id=${lastId}`;

    const response = await fetch(url, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`TheRundown API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get teams for a sport
   */
  async getTeams(sportId: number): Promise<Team[]> {
    const url = `${API_BASE}/sports/${sportId}/teams`;

    const response = await fetch(url, {
      headers: this.headers,
    });

    if (!response.ok) {
      throw new Error(`TheRundown API error: ${response.status}`);
    }

    const data = await response.json();
    return data.teams || [];
  }
}

/**
 * Convert TheRundown game status to our status
 */
export function mapGameStatus(status: string): string {
  const statusMap: Record<string, string> = {
    'STATUS_SCHEDULED': 'scheduled',
    'STATUS_IN_PROGRESS': 'in_progress',
    'STATUS_HALFTIME': 'in_progress',
    'STATUS_END_PERIOD': 'in_progress',
    'STATUS_FINAL': 'final',
    'STATUS_POSTPONED': 'postponed',
    'STATUS_CANCELED': 'canceled',
  };
  return statusMap[status] || 'scheduled';
}

/**
 * Sync games from TheRundown to D1
 */
export async function syncGames(
  db: import('@cloudflare/workers-types').D1Database,
  api: SportsAPI,
  eventId: string,
  sportId: number,
  startDate: string,
  endDate: string
): Promise<{ synced: number; updated: number }> {
  let synced = 0;
  let updated = 0;

  // Get all options (teams) for this event to map external IDs
  const optionsStmt = db.prepare(`SELECT id, external_id FROM options WHERE event_id = ?`);
  const optionsResult = await optionsStmt.bind(eventId).all<{ id: string; external_id: string | null }>();
  const teamIdMap = new Map(
    optionsResult.results
      .filter((o) => o.external_id)
      .map((o) => [o.external_id!, o.id])
  );

  // Fetch games for date range
  const currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    const dateStr = currentDate.toISOString().split('T')[0];

    try {
      const games = await api.getEvents(sportId, dateStr);

      for (const game of games) {
        const homeTeam = game.teams_normalized?.find((t) => t.is_home);
        const awayTeam = game.teams_normalized?.find((t) => t.is_away);

        if (!homeTeam || !awayTeam) continue;

        const homeTeamId = teamIdMap.get(String(homeTeam.team_id));
        const awayTeamId = teamIdMap.get(String(awayTeam.team_id));

        // Skip if we don't have these teams in our event
        if (!homeTeamId && !awayTeamId) continue;

        const gameStatus = mapGameStatus(game.score?.event_status || 'STATUS_SCHEDULED');

        // Upsert game
        const stmt = db.prepare(`
          INSERT INTO games (id, event_id, external_id, home_team_id, away_team_id, home_score, away_score, status, scheduled_at, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(external_id) DO UPDATE SET
            home_score = excluded.home_score,
            away_score = excluded.away_score,
            status = excluded.status,
            metadata = excluded.metadata,
            updated_at = strftime('%s', 'now')
        `);

        await stmt
          .bind(
            crypto.randomUUID(),
            eventId,
            game.event_id,
            homeTeamId || null,
            awayTeamId || null,
            game.score?.score_home ?? null,
            game.score?.score_away ?? null,
            gameStatus,
            new Date(game.event_date).getTime() / 1000,
            JSON.stringify({
              venue: game.score?.venue_name,
              broadcast: game.score?.broadcast,
              period: game.score?.game_period,
              clock: game.score?.display_clock,
            })
          )
          .run();

        synced++;
        if (gameStatus === 'final') updated++;
      }
    } catch (error) {
      console.error(`Failed to sync games for ${dateStr}:`, error);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return { synced, updated };
}

/**
 * Get NFL teams for seeding
 */
// Team IDs from TheRundown API - verified 2026-01-24
export const NFL_TEAMS = [
  { name: 'Arizona Cardinals', abbreviation: 'ARI', external_id: '89' },
  { name: 'Atlanta Falcons', abbreviation: 'ATL', external_id: '85' },
  { name: 'Baltimore Ravens', abbreviation: 'BAL', external_id: '65' },
  { name: 'Buffalo Bills', abbreviation: 'BUF', external_id: '61' },
  { name: 'Carolina Panthers', abbreviation: 'CAR', external_id: '86' },
  { name: 'Chicago Bears', abbreviation: 'CHI', external_id: '81' },
  { name: 'Cincinnati Bengals', abbreviation: 'CIN', external_id: '66' },
  { name: 'Cleveland Browns', abbreviation: 'CLE', external_id: '67' },
  { name: 'Dallas Cowboys', abbreviation: 'DAL', external_id: '77' },
  { name: 'Denver Broncos', abbreviation: 'DEN', external_id: '73' },
  { name: 'Detroit Lions', abbreviation: 'DET', external_id: '82' },
  { name: 'Green Bay Packers', abbreviation: 'GB', external_id: '83' },
  { name: 'Houston Texans', abbreviation: 'HOU', external_id: '69' },
  { name: 'Indianapolis Colts', abbreviation: 'IND', external_id: '70' },
  { name: 'Jacksonville Jaguars', abbreviation: 'JAX', external_id: '71' },
  { name: 'Kansas City Chiefs', abbreviation: 'KC', external_id: '74' },
  { name: 'Las Vegas Raiders', abbreviation: 'LV', external_id: '75' },
  { name: 'Los Angeles Chargers', abbreviation: 'LAC', external_id: '76' },
  { name: 'Los Angeles Rams', abbreviation: 'LAR', external_id: '90' },
  { name: 'Miami Dolphins', abbreviation: 'MIA', external_id: '62' },
  { name: 'Minnesota Vikings', abbreviation: 'MIN', external_id: '84' },
  { name: 'New England Patriots', abbreviation: 'NE', external_id: '63' },
  { name: 'New Orleans Saints', abbreviation: 'NO', external_id: '87' },
  { name: 'New York Giants', abbreviation: 'NYG', external_id: '78' },
  { name: 'New York Jets', abbreviation: 'NYJ', external_id: '64' },
  { name: 'Philadelphia Eagles', abbreviation: 'PHI', external_id: '79' },
  { name: 'Pittsburgh Steelers', abbreviation: 'PIT', external_id: '68' },
  { name: 'San Francisco 49ers', abbreviation: 'SF', external_id: '91' },
  { name: 'Seattle Seahawks', abbreviation: 'SEA', external_id: '92' },
  { name: 'Tampa Bay Buccaneers', abbreviation: 'TB', external_id: '88' },
  { name: 'Tennessee Titans', abbreviation: 'TEN', external_id: '72' },
  { name: 'Washington Commanders', abbreviation: 'WSH', external_id: '80' },
];
