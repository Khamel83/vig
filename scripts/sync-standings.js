/**
 * Unified Standings Sync Worker
 * Syncs standings from ESPN API for all sports
 *
 * Usage:
 *   wrangler pages dev dist --local --kv=KV --d1=DB -- scripts/sync-standings.js
 *   wrangler pages deploy dist --project-name=vig-standings
 *
 * Environment variables (set in Cloudflare dashboard):
 *   - DB: D1 database binding (auto-bound via wrangler.toml)
 */

import { ESPNAPI, syncESPNStandings, updateUserStandingsFromESPN, shouldSyncStandings } from '../src/lib/espn-api.ts';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

/**
 * Sport configurations for standings sync
 */
const SPORT_CONFIGS = {
  nba26: {
    eventId: 'nba26-event',
    sport: 'NBA',
  },
  // Future: nfl2025, mlb2026, etc.
} as const;

/**
 * Main sync handler
 */
export default {
  /**
   * Scheduled event handler (Cloudflare Cron)
   * Runs on schedule defined in wrangler.toml
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<Response> {
    const results: Array<{
      event: string;
      sport: string;
      synced: number;
      source: string;
      usersUpdated: number;
      error?: string;
    }> = [];

    console.log('Standings sync started at:', new Date().toISOString());

    // Process each configured event
    for (const [key, config] of Object.entries(SPORT_CONFIGS)) {
      try {
        // Check if we should sync this sport based on schedule
        if (!shouldSyncStandings(config.sport as keyof typeof SPORT_CONFIGS)) {
          console.log(`Skipping ${config.sport} standings - outside sync window`);
          continue;
        }

        console.log(`Syncing ${config.sport} standings for ${config.eventId}...`);

        // Create ESPN API client
        const espn = new ESPNAPI();

        // Sync standings to espn_standings table
        const syncResult = await syncESPNStandings(env.DB, espn, config.eventId);
        console.log(`  Synced ${syncResult.synced} teams from ${syncResult.source}`);

        // Update user standings from ESPN standings
        const updateResult = await updateUserStandingsFromESPN(env.DB, config.eventId);
        console.log(`  Updated ${updateResult.updated} user standings`);

        results.push({
          event: key,
          sport: config.sport,
          synced: syncResult.synced,
          source: syncResult.source,
          usersUpdated: updateResult.updated,
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

    console.log('Standings sync completed:', results);

    return new Response(JSON.stringify(results, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * HTTP request handler (for manual triggering)
   * GET /  - Run sync and return results
   * GET /status  - Check sync status
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'healthy' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Status check
    if (path === '/status') {
      const latestSync = await env.DB.prepare(`
        SELECT event_id, sport, team_abbr, wins, losses, sync_source, synced_at
        FROM espn_standings
        ORDER BY synced_at DESC
        LIMIT 1
      `).first();

      return new Response(JSON.stringify({
        latestSync,
        shouldSyncNBA: shouldSyncStandings('NBA'),
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Manual sync trigger (only allow POST for security)
    if (path === '/' && request.method === 'POST') {
      // Treat as scheduled event
      return this.scheduled({ scheduledTime: Date.now() } as ScheduledEvent, env, ctx);
    }

    // GET on root shows usage info
    if (path === '/') {
      return new Response(JSON.stringify({
        message: 'Vig Standings Sync Worker',
        usage: {
          'POST /': 'Manually trigger standings sync',
          'GET /health': 'Health check',
          'GET /status': 'Check latest sync status',
        },
        scheduled: 'Runs automatically on Cloudflare Cron schedule',
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
