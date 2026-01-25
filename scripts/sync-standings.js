/**
 * Simple Standings Sync Worker
 * Scrapes ESPN standings pages hourly
 *
 * URLs:
 * - https://www.espn.com/nba/standings
 * - https://www.espn.com/nfl/standings
 * - https://www.espn.com/mlb/standings
 * - https://www.espn.com/f1/standings
 * - https://www.espn.com/soccer/table/_/league/fifa.world
 */

export interface Env {
  DB: D1Database;
}

/**
 * Sport configurations
 */
const SPORT_CONFIGS = {
  nba26: {
    eventId: 'nba26-event',
    sport: 'NBA',
    url: 'https://www.espn.com/nba/standings',
  },
  // Future: nfl2025, mlb2026, etc.
};

/**
 * Team abbreviations mapping (abbreviation -> our option ID)
 */
const TEAM_MAP = {
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
 * Simple scraper - parses ESPN standings HTML
 */
async function scrapeStandings(url: string): Promise<Array<{abbr: string, wins: number, losses: number}>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const standings = [];

  // ESPN pages have data in the HTML (even if loaded via JS, there's server-rendered content)
  // Look for patterns like: <td>OKC</td><td>37-9</td> or similar
  const lines = html.split('\n');

  for (const line of lines) {
    // Look for team abbreviation (3 uppercase letters)
    const abbrMatch = line.match(/[A-Z]{3}/);
    if (!abbrMatch) continue;

    const abbr = abbrMatch[0];
    if (!TEAM_MAP[abbr]) continue; // Skip if not one of our teams

    // Look for W-L record on same or nearby line
    const recordMatch = line.match(/(\d+)-(\d+)/);
    if (!recordMatch) continue;

    const wins = parseInt(recordMatch[1], 10);
    const losses = parseInt(recordMatch[2], 10);

    // Only add if we haven't seen this team yet
    if (!standings.find(s => s.abbr === abbr)) {
      standings.push({ abbr, wins, losses });
    }
  }

  return standings;
}

/**
 * Update user standings from team records
 */
async function updateUserStandings(db: D1Database, eventId: string): Promise<number> {
  // Calculate each user's total wins/losses
  const usersStmt = db.prepare(`
    SELECT DISTINCT user_id FROM selections WHERE event_id = ?
  `);

  const usersResult = await usersStmt.bind(eventId).all<{ user_id: string }>();
  let updated = 0;

  for (const { user_id } of usersResult.results) {
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
      const winPercentage = result.total_wins + result.total_losses > 0
        ? result.total_wins / (result.total_wins + result.total_losses)
        : 0;

      const updateStmt = db.prepare(`
        INSERT INTO standings (event_id, user_id, wins, losses, points, rank, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id, user_id) DO UPDATE SET
          wins = excluded.wins,
          losses = excluded.losses,
          points = excluded.points,
          updated_at = excluded.updated_at
      `);

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
    SET rank = (SELECT rank FROM ranked WHERE ranked.user_id = standings.user_id)
    WHERE event_id = ?
  `);

  await rankStmt.bind(eventId, eventId).run();

  return updated;
}

/**
 * Main sync handler
 */
export default {
  /**
   * Scheduled event handler
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<Response> {
    const results = [];

    console.log('Standings sync started:', new Date().toISOString());

    for (const [key, config] of Object.entries(SPORT_CONFIGS)) {
      try {
        console.log(`Syncing ${config.sport}...`);

        // Scrape standings
        const standings = await scrapeStandings(config.url);
        console.log(`  Found ${standings.length} teams`);

        let synced = 0;
        for (const { abbr, wins, losses } of standings) {
          const teamId = TEAM_MAP[abbr];
          if (!teamId) continue;

          // Upsert to espn_standings
          const stmt = env.DB.prepare(`
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
              `${config.eventId}-${abbr}`,
              config.eventId,
              config.sport,
              teamId,
              abbr,
              abbr,
              wins,
              losses,
              'espn_scrape',
              Math.floor(Date.now() / 1000)
            )
            .run();

          synced++;
        }

        console.log(`  Synced ${synced} teams`);

        // Update user standings
        const usersUpdated = await updateUserStandings(env.DB, config.eventId);
        console.log(`  Updated ${usersUpdated} users`);

        results.push({
          event: key,
          sport: config.sport,
          synced,
          usersUpdated,
        });
      } catch (error) {
        console.error(`Error syncing ${key}:`, error);
        results.push({
          event: key,
          sport: config.sport,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log('Sync complete:', results);

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * HTTP handler for manual triggers
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'healthy', date: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/' && request.method === 'POST') {
      return this.scheduled({ scheduledTime: Date.now() } as ScheduledEvent, env, ctx);
    }

    return new Response(JSON.stringify({
      message: 'Vig Standings Sync Worker',
      usage: {
        'POST /': 'Manual sync trigger',
        'GET /health': 'Health check',
      },
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
