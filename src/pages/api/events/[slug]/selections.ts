import type { APIRoute } from 'astro';
import { events, options, selections } from '@/lib/db';
import { requireAuth, parseBody, jsonResponse, errorResponse } from '@/lib/middleware';

// GET /api/events/[slug]/selections - Get user's selections
export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Check auth
    const auth = await requireAuth(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    const { slug } = params;
    if (!slug) {
      return errorResponse('Event slug required');
    }

    const event = await events.getBySlug(DB, slug);
    if (!event) {
      return errorResponse('Event not found', 404);
    }

    const userSelections = await selections.listByUser(DB, event.id, auth.user.id);

    return jsonResponse({ selections: userSelections });
  } catch (error) {
    console.error('Get selections error:', error);
    return errorResponse('Internal server error', 500);
  }
};

// POST /api/events/[slug]/selections - Add selection
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Check auth
    const auth = await requireAuth(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    const { slug } = params;
    if (!slug) {
      return errorResponse('Event slug required');
    }

    const event = await events.getBySlug(DB, slug);
    if (!event) {
      return errorResponse('Event not found', 404);
    }

    // Only allow selections when event is open
    if (event.status !== 'open') {
      return errorResponse(`Event is ${event.status}, selections not allowed`);
    }

    // Parse body
    const body = await parseBody<{
      option_id: string;
      prediction_data?: Record<string, unknown>;
    }>(request);
    if (body instanceof Response) return body;

    if (!body.option_id) {
      return errorResponse('option_id required');
    }

    // Verify option belongs to this event
    const option = await options.getById(DB, body.option_id);
    if (!option || option.event_id !== event.id) {
      return errorResponse('Invalid option for this event');
    }

    // Check max selections
    if (event.max_selections) {
      const existingSelections = await selections.listByUser(DB, event.id, auth.user.id);
      const existingIds = existingSelections.map((s) => s.option_id);

      // Allow if updating existing selection or under limit
      if (!existingIds.includes(body.option_id) && existingSelections.length >= event.max_selections) {
        return errorResponse(`Maximum ${event.max_selections} selections allowed`);
      }
    }

    // Create/update selection
    const selection = await selections.create(DB, {
      event_id: event.id,
      user_id: auth.user.id,
      option_id: body.option_id,
      prediction_data: JSON.stringify(body.prediction_data || {}),
    });

    return jsonResponse({ selection }, 201);
  } catch (error) {
    console.error('Create selection error:', error);
    return errorResponse('Internal server error', 500);
  }
};

// DELETE /api/events/[slug]/selections - Remove selection
export const DELETE: APIRoute = async ({ params, request, locals, url }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Check auth
    const auth = await requireAuth(request, DB, jwtSecret);
    if (auth instanceof Response) return auth;

    const { slug } = params;
    if (!slug) {
      return errorResponse('Event slug required');
    }

    const event = await events.getBySlug(DB, slug);
    if (!event) {
      return errorResponse('Event not found', 404);
    }

    // Only allow changes when event is open
    if (event.status !== 'open') {
      return errorResponse(`Event is ${event.status}, changes not allowed`);
    }

    const optionId = url.searchParams.get('option_id');
    if (!optionId) {
      return errorResponse('option_id query param required');
    }

    await selections.delete(DB, event.id, auth.user.id, optionId);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error('Delete selection error:', error);
    return errorResponse('Internal server error', 500);
  }
};
