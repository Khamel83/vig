import type { APIRoute } from 'astro';
import { events } from '@/lib/db';
import { SportsAPI, SPORT_IDS, syncGames } from '@/lib/sports-api';
import { updateEventStandings } from '@/lib/scoring';
import { requireAdmin, jsonResponse, errorResponse } from '@/lib/middleware';

/**
 * POST /api/admin/sync-scores - Sync scores from TheRundown API
 * Admin only - called manually or via scheduled job
 */
export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const { runtime } = locals;
    const { DB, LEADERBOARD } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';
    const apiKey = runtime.env.THE_RUNDOWN_API_KEY;

    // Check admin auth
    const auth = await requireAdmin(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    if (!apiKey) {
      return errorResponse('THE_RUNDOWN_API_KEY not configured', 503);
    }

    const api = new SportsAPI(apiKey);
    const eventSlug = url.searchParams.get('event');

    const results: Array<{
      event: string;
      synced: number;
      updated: number;
      standings_updated: boolean;
    }> = [];

    if (eventSlug) {
      // Sync specific event
      const event = await events.getBySlug(DB, eventSlug);
      if (!event) {
        return errorResponse('Event not found', 404);
      }

      if (event.status !== 'active' && event.status !== 'completed') {
        return errorResponse('Event must be active or completed to sync scores');
      }

      const sportId = SPORT_IDS[event.sport as keyof typeof SPORT_IDS];
      if (!sportId) {
        return errorResponse(`Unknown sport: ${event.sport}`);
      }

      // Sync games for season (adjust dates as needed)
      const startDate = event.starts_at
        ? new Date(event.starts_at * 1000).toISOString().split('T')[0]
        : '2025-09-01';
      const endDate = new Date().toISOString().split('T')[0];

      const { synced, updated } = await syncGames(DB, api, event.id, sportId, startDate, endDate);

      // Update standings if games were completed
      let standingsUpdated = false;
      if (updated > 0) {
        await updateEventStandings(DB, LEADERBOARD, event.id);
        standingsUpdated = true;
      }

      results.push({
        event: event.slug,
        synced,
        updated,
        standings_updated: standingsUpdated,
      });
    } else {
      // Sync all active and completed events
      const activeEvents = [...await events.list(DB, 'active'), ...await events.list(DB, 'completed')];

      for (const event of activeEvents) {
        try {
          const sportId = SPORT_IDS[event.sport as keyof typeof SPORT_IDS];
          if (!sportId) continue;

          const startDate = event.starts_at
            ? new Date(event.starts_at * 1000).toISOString().split('T')[0]
            : '2025-09-01';
          const endDate = new Date().toISOString().split('T')[0];

          const { synced, updated } = await syncGames(DB, api, event.id, sportId, startDate, endDate);

          let standingsUpdated = false;
          if (updated > 0) {
            await updateEventStandings(DB, LEADERBOARD, event.id);
            standingsUpdated = true;
          }

          results.push({
            event: event.slug,
            synced,
            updated,
            standings_updated: standingsUpdated,
          });
        } catch (error) {
          console.error(`Failed to sync ${event.slug}:`, error);
          results.push({
            event: event.slug,
            synced: 0,
            updated: 0,
            standings_updated: false,
          });
        }
      }
    }

    return jsonResponse({ results });
  } catch (error) {
    console.error('Sync scores error:', error);
    return errorResponse('Internal server error', 500);
  }
};
