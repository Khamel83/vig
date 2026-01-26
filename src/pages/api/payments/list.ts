/**
 * List payments endpoint
 * GET /api/payments/list?event_id=xxx&user_id=xxx&status=xxx
 */

import { payments } from '@/lib/payments';
import { requireAuth, jsonResponse, errorResponse } from '@/lib/middleware';
import type { Context } from 'astro';

export async function GET(context: Context): Promise<Response> {
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

  // Get query parameters
  const eventId = context.locals.url.searchParams.get('event_id');
  const userId = context.locals.url.searchParams.get('user_id');
  const status = context.locals.url.searchParams.get('status');

  try {
    let paymentList = [];

    // Admin can see all payments, users can only see their own
    if (authResult.user.is_admin) {
      if (eventId) {
        paymentList = await payments.getByEvent(DB, eventId);
      } else {
        // Admin can get all payments (need to implement getAll in payments.ts)
        // For now, return empty for admin without event filter
        paymentList = [];
      }
    } else {
      // Regular users can only see their own payments
      paymentList = await payments.getByUser(DB, authResult.user.id);

      // Filter by event_id if provided
      if (eventId) {
        paymentList = paymentList.filter((p: any) => p.event_id === eventId);
      }
    }

    // Filter by status if provided
    if (status) {
      paymentList = paymentList.filter((p: any) => p.status === status);
    }

    return jsonResponse({
      success: true,
      payments: paymentList,
    });
  } catch (error) {
    console.error('Payment list error:', error);
    return errorResponse('Failed to list payments', 500);
  }
}
