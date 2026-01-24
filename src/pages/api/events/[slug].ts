import type { APIRoute } from 'astro';
import { events, options, selections, standings } from '@/lib/db';
import { requireAdmin, parseBody, jsonResponse, errorResponse } from '@/lib/middleware';

// GET /api/events/[slug] - Get single event with options and standings
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;

    const { slug } = params;
    if (!slug) {
      return errorResponse('Event slug required');
    }

    const event = await events.getBySlug(DB, slug);
    if (!event) {
      return errorResponse('Event not found', 404);
    }

    // Get options (teams) for this event
    const eventOptions = await options.listByEvent(DB, event.id);

    // Get standings if event is active or completed
    let eventStandings: Awaited<ReturnType<typeof standings.listByEvent>> = [];
    if (event.status === 'active' || event.status === 'completed') {
      eventStandings = await standings.listByEvent(DB, event.id);
    }

    // Get all selections with user info for completed events (read-only display)
    let eventSelections: Array<{
      id: string;
      option_id: string;
      user_id: string;
      user_name: string;
    }> = [];
    if (event.status === 'completed') {
      const selectionsStmt = DB.prepare(`
        SELECT s.id, s.option_id, s.user_id, u.name as user_name
        FROM selections s
        JOIN users u ON s.user_id = u.id
        WHERE s.event_id = ?
      `);
      const selectionsResult = await selectionsStmt.bind(event.id).all<{
        id: string;
        option_id: string;
        user_id: string;
        user_name: string;
      }>();
      eventSelections = selectionsResult.results;
    }

    // Get team-level standings (wins/losses per team)
    const teamStandingsStmt = DB.prepare(`
      SELECT
        o.id as option_id,
        COUNT(CASE WHEN g.status = 'final' AND (
          (g.home_team_id = o.id AND g.home_score > g.away_score) OR
          (g.away_team_id = o.id AND g.away_score > g.home_score)
        ) THEN 1 END) as wins,
        COUNT(CASE WHEN g.status = 'final' AND (
          (g.home_team_id = o.id AND g.home_score < g.away_score) OR
          (g.away_team_id = o.id AND g.away_score < g.home_score)
        ) THEN 1 END) as losses
      FROM options o
      LEFT JOIN games g ON (g.home_team_id = o.id OR g.away_team_id = o.id) AND g.event_id = o.event_id
      WHERE o.event_id = ?
      GROUP BY o.id
    `);
    const teamStandingsResult = await teamStandingsStmt.bind(event.id).all<{
      option_id: string;
      wins: number;
      losses: number;
    }>();
    const teamStandings = new Map(teamStandingsResult.results.map(t => [t.option_id, { wins: t.wins, losses: t.losses }]));

    return jsonResponse({
      event,
      options: eventOptions,
      standings: eventStandings,
      selections: eventSelections,
      team_standings: Object.fromEntries(teamStandings),
    });
  } catch (error) {
    console.error('Get event error:', error);
    return errorResponse('Internal server error', 500);
  }
};

// PATCH /api/events/[slug] - Update event (admin only)
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Check admin auth
    const auth = await requireAdmin(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    const { slug } = params;
    if (!slug) {
      return errorResponse('Event slug required');
    }

    const event = await events.getBySlug(DB, slug);
    if (!event) {
      return errorResponse('Event not found', 404);
    }

    // Parse body
    const body = await parseBody<Partial<{
      name: string;
      description: string;
      status: 'draft' | 'open' | 'active' | 'completed';
      max_selections: number;
      starts_at: number;
      ends_at: number;
      config: Record<string, unknown>;
    }>>(request);
    if (body instanceof Response) return body;

    // Validate status transitions
    if (body.status) {
      const validTransitions: Record<string, string[]> = {
        draft: ['open'],
        open: ['active', 'draft'],
        active: ['completed'],
        completed: [], // Can't change from completed
      };

      if (!validTransitions[event.status]?.includes(body.status)) {
        return errorResponse(`Invalid status transition from ${event.status} to ${body.status}`);
      }
    }

    // Update event
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.max_selections !== undefined) updates.max_selections = body.max_selections;
    if (body.starts_at !== undefined) updates.starts_at = body.starts_at;
    if (body.ends_at !== undefined) updates.ends_at = body.ends_at;
    if (body.config !== undefined) updates.config = JSON.stringify(body.config);

    const updated = await events.update(DB, event.id, updates);

    return jsonResponse({ event: updated });
  } catch (error) {
    console.error('Update event error:', error);
    return errorResponse('Internal server error', 500);
  }
};

// DELETE /api/events/[slug] - Delete event (admin only, draft only)
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Check admin auth
    const auth = await requireAdmin(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    const { slug } = params;
    if (!slug) {
      return errorResponse('Event slug required');
    }

    const event = await events.getBySlug(DB, slug);
    if (!event) {
      return errorResponse('Event not found', 404);
    }

    // Only allow deleting draft events
    if (event.status !== 'draft') {
      return errorResponse('Only draft events can be deleted');
    }

    // Delete event (cascade will handle options, selections, etc.)
    const stmt = DB.prepare(`DELETE FROM events WHERE id = ?`);
    await stmt.bind(event.id).run();

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Delete event error:', error);
    return errorResponse('Internal server error', 500);
  }
};
