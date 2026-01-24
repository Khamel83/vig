import type { APIRoute } from 'astro';
import { events, options } from '@/lib/db';
import { NFL_TEAMS } from '@/lib/sports-api';
import { requireAdmin, jsonResponse, errorResponse } from '@/lib/middleware';

/**
 * POST /api/admin/seed-teams - Seed teams for an event
 * Admin only - populates options table with team data
 */
export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Check admin auth
    const auth = await requireAdmin(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    const eventSlug = url.searchParams.get('event');
    if (!eventSlug) {
      return errorResponse('event query parameter required');
    }

    const event = await events.getBySlug(DB, eventSlug);
    if (!event) {
      return errorResponse('Event not found', 404);
    }

    // Check if teams already exist
    const existingOptions = await options.listByEvent(DB, event.id);
    if (existingOptions.length > 0) {
      return errorResponse('Event already has teams. Delete them first to re-seed.');
    }

    // Get teams based on sport
    let teams: Array<{ name: string; abbreviation: string; external_id: string }>;

    switch (event.sport) {
      case 'NFL':
        teams = NFL_TEAMS;
        break;
      // Add more sports as needed
      default:
        return errorResponse(`No seed data for sport: ${event.sport}`);
    }

    // Insert teams
    await options.createBatch(
      DB,
      teams.map((team) => ({
        event_id: event.id,
        external_id: team.external_id,
        name: team.name,
        abbreviation: team.abbreviation,
        logo_url: null,
        metadata: '{}',
      }))
    );

    return jsonResponse({
      success: true,
      event: event.slug,
      teams_added: teams.length,
    });
  } catch (error) {
    console.error('Seed teams error:', error);
    return errorResponse('Internal server error', 500);
  }
};
