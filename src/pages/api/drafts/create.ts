/**
 * Create draft endpoint
 * POST /api/drafts/create
 */

import { drafts, draftHelpers } from '@/lib/drafts';
import { requireAuth, parseBody, errorResponse, jsonResponse } from '@/lib/middleware';
import type { Context } from 'astro';

interface CreateDraftRequest {
  event_id: string;
  total_rounds: number;
  // draft_order will be generated from event participants
}

export async function POST(context: Context): Promise<Response> {
  const { DB } = context.locals.runtime.env;

  // Require authentication
  const authResult = await requireAuth(
    context.locals.request,
    DB,
    context.locals.runtime.env.JWT_SECRET || ''
  );

  if (authResult instanceof Response) {
    return authResult;
  }

  // Parse request body
  const body = await parseBody<CreateDraftRequest>(context.locals.request);
  if (body instanceof Response) {
    return body;
  }

  // Validate required fields
  if (!body.event_id || !body.total_rounds) {
    return errorResponse('Missing required fields: event_id, total_rounds');
  }

  if (body.total_rounds < 1 || body.total_rounds > 50) {
    return errorResponse('total_rounds must be between 1 and 50');
  }

  try {
    // Check if event exists
    const eventStmt = await DB.prepare('SELECT * FROM events WHERE id = ?').bind(body.event_id);
    const event = await eventStmt.first();

    if (!event) {
      return errorResponse('Event not found', 404);
    }

    // Check if user is event creator or admin
    if (event.created_by !== authResult.user.id && !authResult.user.is_admin) {
      return errorResponse('Only the event creator can start a draft', 403);
    }

    // Check if draft already exists for this event
    const existingDraft = await drafts.getByEvent(DB, body.event_id);
    if (existingDraft) {
      return errorResponse('Draft already exists for this event', 400);
    }

    // Get participants for draft order
    const participantsStmt = await DB.prepare(`
      SELECT user_id FROM event_participants WHERE event_id = ? ORDER BY joined_at
    `).bind(body.event_id);
    const participantsResult = await participantsStmt.all();

    if (participantsResult.results.length < 2) {
      return errorResponse('At least 2 participants required to start a draft', 400);
    }

    const participantIds = participantsResult.results.map((r: any) => r.user_id);

    // Generate snake draft order
    const draftOrder = draftHelpers.generateSnakeOrder(participantIds, body.total_rounds);

    // Create draft
    const draft = await drafts.create(DB, {
      event_id: body.event_id,
      total_rounds: body.total_rounds,
      draft_order: draftOrder,
      created_by: authResult.user.id,
    });

    return jsonResponse({
      success: true,
      draft,
    }, 201);
  } catch (error) {
    console.error('Draft creation error:', error);
    return errorResponse('Failed to create draft', 500);
  }
}
