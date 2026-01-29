/**
 * Standings Sync Worker
 * Uses sports-reference.com scrapers (clean HTML, easy to parse)
 *
 * URLs:
 * - NBA: https://www.basketball-reference.com/leagues/NBA_2026_standings.html
 * - NFL: https://www.pro-football-reference.com/years/2025/#all_AFC, #all_NFC
 * - MLB: https://www.baseball-reference.com/leagues/majors/2025-standings.shtml
 * - Soccer: https://fbref.com/en/comps/1/schedule/World-Cup-Scores-and-Fixtures
 *
 * Schedule: Twice daily (9am ET, 11pm ET)
 */

import { scrapeNBAStandings, syncScrapedStandings } from '../src/lib/sports-reference-scraper.ts';

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
  },
  // Future: nfl2025, mlb2026, etc.
} as const;

/**
 * Update user standings from team records
 */
async function updateUserStandings(db: D1Database, eventId: string): Promise<number> {
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

    console.log('=== Standings Sync Started ===');
    console.log('Time:', new Date().toISOString());
    console.log('Source: sports-reference.com');

    for (const [key, config] of Object.entries(SPORT_CONFIGS)) {
      try {
        console.log(`\nSyncing ${key} (${config.sport})...`);

        let standings;

        // Scrape based on sport
        switch (config.sport) {
          case 'NBA':
            standings = await scrapeNBAStandings();
            break;
          // Future: NFL, MLB, etc.
          default:
            throw new Error(`Unsupported sport: ${config.sport}`);
        }

        console.log(`  Found ${standings.length} teams`);

        // Sync to database
        const syncResult = await syncScrapedStandings(env.DB, standings, config.eventId, config.sport);
        console.log(`  Synced ${syncResult.synced} teams from ${syncResult.source}`);

        // Update user standings
        const usersUpdated = await updateUserStandings(env.DB, config.eventId);
        console.log(`  Updated ${usersUpdated} users`);

        results.push({
          event: key,
          sport: config.sport,
          synced: syncResult.synced,
          source: syncResult.source,
          usersUpdated,
        });
      } catch (error) {
        console.error(`Error syncing ${key}:`, error);
        results.push({
          event: key,
          sport: config.sport,
          synced: 0,
          source: 'error',
          usersUpdated: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log('\n=== Sync Complete ===');
    console.log('Results:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify({
      timestamp: new Date().toISOString(),
      results,
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * HTTP handler for manual triggers
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        date: new Date().toISOString(),
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/status') {
      const latestSync = await env.DB.prepare(`
        SELECT sport, team_abbr, wins, losses, sync_source, synced_at
        FROM espn_standings
        ORDER BY synced_at DESC
        LIMIT 10
      `).all();

      return new Response(JSON.stringify({
        latestSync: latestSync.results,
      }, null, 2), {
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
        'GET /status': 'View latest sync status',
      },
      schedule: 'Runs twice daily: 9am ET, 11pm ET',
      sources: 'sports-reference.com (basketball-reference.com, pro-football-reference.com, etc.)',
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
