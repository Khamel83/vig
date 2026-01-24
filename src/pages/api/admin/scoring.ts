import type { APIRoute } from 'astro';
import { events } from '@/lib/db';
import { updateEventStandings } from '@/lib/scoring';
import { requireAdmin, jsonResponse, errorResponse } from '@/lib/middleware';

/**
 * POST /api/admin/scoring - Recalculate standings for event(s)
 * Admin only - typically called after importing game results
 */
export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const { runtime } = locals;
    const { DB, LEADERBOARD } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Check admin auth
    const auth = await requireAdmin(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    const eventSlug = url.searchParams.get('event');

    if (eventSlug) {
      // Calculate standings for specific event
      const event = await events.getBySlug(DB, eventSlug);
      if (!event) {
        return errorResponse('Event not found', 404);
      }

      const standings = await updateEventStandings(DB, LEADERBOARD, event.id);
      return jsonResponse({ event: event.slug, standings });
    }

    // Calculate standings for all active events
    const activeEvents = await events.list(DB, 'active');
    const results = [];

    for (const event of activeEvents) {
      try {
        const standings = await updateEventStandings(DB, LEADERBOARD, event.id);
        results.push({ event: event.slug, standings_count: standings.length });
      } catch (error) {
        console.error(`Failed to update standings for ${event.slug}:`, error);
        results.push({ event: event.slug, error: 'Failed to calculate' });
      }
    }

    return jsonResponse({ updated: results });
  } catch (error) {
    console.error('Scoring error:', error);
    return errorResponse('Internal server error', 500);
  }
};
