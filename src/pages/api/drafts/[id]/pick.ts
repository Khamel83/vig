/**
 * Make pick endpoint
 * POST /api/drafts/:id/pick
 */

import { drafts, draftPicks } from '@/lib/drafts';
import { requireAuth, parseBody, errorResponse, jsonResponse } from '@/lib/middleware';
import type { APIRoute } from 'astro';

interface MakePickRequest {
  option_id: string;
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { DB } = locals.runtime.env;
    const { id } = params;

    // Require authentication
    const authResult = await requireAuth(
      request,
      DB,
      locals.runtime.env.JWT_SECRET || ''
    );

    if (authResult instanceof Response) {
      return authResult;
    }

    // Parse request body
    const body = await parseBody<MakePickRequest>(request);
    if (body instanceof Response) {
      return body;
    }

    if (!body.option_id) {
      return errorResponse('Missing required field: option_id');
    }

    // Make pick
    const result = await drafts.makePick(DB, id, authResult.user.id, body.option_id);

    if (!result.success) {
      return errorResponse(result.error || 'Failed to make pick', 400);
    }

    return jsonResponse({
      success: true,
      pick: result.pick,
    });
  } catch (error) {
    console.error('Make pick error:', error);
    return errorResponse('Failed to make pick', 500);
  }
};
