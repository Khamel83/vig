/**
 * Standings Sync Worker
 * Primary: Playwright scraper (reliable, scrapes ESPN pages)
 * Backup: API-Sports.io (if available)
 *
 * URLs scraped:
 * - https://www.espn.com/nba/standings
 * - https://www.espn.com/nfl/standings
 * - https://www.espn.com/mlb/standings
 * - https://www.espn.com/nhl/standings
 * - https://www.espn.com/f1/standings
 * - https://www.espn.com/soccer/table/_/league/fifa.world
 *
 * Schedule: Twice daily (9am ET, 11pm ET)
 */

import { ApiSportsClient, syncApiSportsStandings } from '../src/lib/api-sports.ts';
import { PlaywrightScraper, syncScrapedStandings } from '../src/lib/playwright-scraper.ts';

export interface Env {
  DB: D1Database;
  API_SPORTS_KEY?: string;  // Optional: can use default key
}

/**
 * Sport configurations
 */
const SPORT_CONFIGS = {
  nba26: {
    eventId: 'nba26-event',
    sport: 'NBA',
    season: 2025,
    apiSportsLeague: 12,
  },
  // Future: nfl2025, mlb2026, nhl2026, etc.
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
 * Sync a single sport with fallback
 * Try Playwright scraper first (reliable), then API-Sports (if needed)
 */
async function syncSportWithFallback(
  db: D1Database,
  config: typeof SPORT_CONFIGS[keyof typeof SPORT_CONFIGS],
  apiKey?: string
): Promise<{ synced: number; source: string; usersUpdated: number; error?: string }> {
  try {
    // Use Playwright scraper as PRIMARY (it actually works)
    console.log(`  Using Playwright scraper for ${config.sport}...`);
    const scraper = new PlaywrightScraper();
    let scrapedStandings: Awaited<ReturnType<typeof scraper.scrapeNBA>>;

    switch (config.sport) {
      case 'NBA':
        scrapedStandings = await scraper.scrapeNBA();
        break;
      case 'NFL':
        scrapedStandings = await scraper.scrapeNFL();
        break;
      case 'MLB':
        scrapedStandings = await scraper.scrapeMLB();
        break;
      case 'NHL':
        scrapedStandings = await scraper.scrapeNHL();
        break;
      default:
        throw new Error(`Unsupported sport: ${config.sport}`);
    }

    const scrapeResult = await syncScrapedStandings(db, scrapedStandings, config.eventId, config.sport);
    console.log(`  Playwright success: ${scrapeResult.synced} teams`);

    const usersUpdated = await updateUserStandings(db, config.eventId);
    console.log(`  Updated ${usersUpdated} users`);

    return {
      synced: scrapeResult.synced,
      source: scrapeResult.source,
      usersUpdated,
    };
  } catch (scrapeError) {
    console.warn(`  Playwright failed: ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}`);
    console.log(`  Falling back to API-Sports...`);

    try {
      // Fall back to API-Sports
      const client = new ApiSportsClient(apiKey);
      const apiResult = await syncApiSportsStandings(db, client, config.eventId, config.sport, config.season);
      console.log(`  API-Sports success: ${apiResult.synced} teams`);

      const usersUpdated = await updateUserStandings(db, config.eventId);
      console.log(`  Updated ${usersUpdated} users`);

      return {
        synced: apiResult.synced,
        source: apiResult.source,
        usersUpdated,
      };
    } catch (apiError) {
      console.error(`  Both methods failed. API error: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
      return {
        synced: 0,
        source: 'error',
        usersUpdated: 0,
        error: `Scraper failed: ${scrapeError instanceof Error ? scrapeError.message : String(scrapeError)}. API failed: ${apiError instanceof Error ? apiError.message : String(apiError)}`,
      };
    }
  }
}

/**
 * Main sync handler
 */
export default {
  /**
   * Scheduled event handler (Cloudflare Cron)
   * Runs twice daily: 9am ET and 11pm ET
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<Response> {
    const results = [];
    const apiKey = env.API_SPORTS_KEY;

    console.log('=== Standings Sync Started ===');
    console.log('Time:', new Date().toISOString());
    console.log('Using API-Sports key:', apiKey ? 'configured' : 'default');

    for (const [key, config] of Object.entries(SPORT_CONFIGS)) {
      console.log(`\nSyncing ${key} (${config.sport})...`);

      try {
        const result = await syncSportWithFallback(env.DB, config, apiKey);
        results.push({
          event: key,
          sport: config.sport,
          ...result,
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
        apiKey: env.API_SPORTS_KEY ? 'configured' : 'default',
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/status') {
      const latestSync = await env.DB.prepare(`
        SELECT sport, team_abbr, wins, losses, sync_source, synced_at
        FROM espn_standings
        ORDER BY synced_at DESC
        LIMIT 5
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
      sources: 'Primary: Playwright (ESPN scraping), Backup: API-Sports.io',
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
