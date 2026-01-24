import type { APIRoute } from 'astro';
import { events, options } from '@/lib/db';
import { requireAdmin, parseBody, jsonResponse, errorResponse } from '@/lib/middleware';

// GET /api/events - List all events
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;

    const status = url.searchParams.get('status');
    const eventList = await events.list(DB, status || undefined);

    return jsonResponse({ events: eventList });
  } catch (error) {
    console.error('List events error:', error);
    return errorResponse('Internal server error', 500);
  }
};

// POST /api/events - Create new event (admin only)
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Check admin auth
    const auth = await requireAdmin(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    // Parse body
    const body = await parseBody<{
      slug: string;
      name: string;
      description?: string;
      sport?: string;
      pool_type?: string;
      max_selections?: number;
      starts_at?: number;
      ends_at?: number;
      config?: Record<string, unknown>;
      teams?: Array<{ name: string; abbreviation?: string; external_id?: string }>;
    }>(request);
    if (body instanceof Response) return body;

    // Validate required fields
    if (!body.slug || !body.name) {
      return errorResponse('Missing required fields: slug, name');
    }

    // Check if slug exists
    const existing = await events.getBySlug(DB, body.slug);
    if (existing) {
      return errorResponse('Event with this slug already exists');
    }

    // Create event
    const event = await events.create(DB, {
      slug: body.slug,
      name: body.name,
      description: body.description,
      sport: body.sport,
      pool_type: body.pool_type,
      max_selections: body.max_selections,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      created_by: auth.user.id,
      config: JSON.stringify(body.config || {}),
    });

    // Create teams/options if provided
    if (body.teams && body.teams.length > 0) {
      await options.createBatch(
        DB,
        body.teams.map((team) => ({
          event_id: event.id,
          external_id: team.external_id || null,
          name: team.name,
          abbreviation: team.abbreviation || null,
          logo_url: null,
          metadata: '{}',
        }))
      );
    }

    return jsonResponse({ event }, 201);
  } catch (error) {
    console.error('Create event error:', error);
    return errorResponse('Internal server error', 500);
  }
};
