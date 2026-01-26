/**
 * Submit payment endpoint
 * POST /api/payments/submit
 */

import { payments } from '@/lib/payments';
import { requireAuth, jsonResponse, errorResponse, parseBody } from '@/lib/middleware';
import type { Context } from 'astro';

interface SubmitPaymentRequest {
  event_id: string;
  amount_cents: number;
  method: 'venmo' | 'cashapp' | 'cash' | 'other';
  transaction_id?: string;
  notes?: string;
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
  const body = await parseBody<SubmitPaymentRequest>(context.locals.request);
  if (body instanceof Response) {
    return body;
  }

  // Validate required fields
  if (!body.event_id || !body.amount_cents || !body.method) {
    return errorResponse('Missing required fields: event_id, amount_cents, method');
  }

  // Validate payment method
  const validMethods = ['venmo', 'cashapp', 'cash', 'other'];
  if (!validMethods.includes(body.method)) {
    return errorResponse(`Invalid payment method. Must be one of: ${validMethods.join(', ')}`);
  }

  // Validate amount
  if (body.amount_cents <= 0) {
    return errorResponse('Amount must be greater than 0');
  }

  try {
    // Create payment
    const payment = await payments.create(DB, {
      event_id: body.event_id,
      user_id: authResult.user.id,
      amount_cents: body.amount_cents,
      method: body.method,
      transaction_id: body.transaction_id,
      notes: body.notes,
    });

    // TODO: Send notification to admin
    // await sendAdminNotification('new_payment', { payment });

    return jsonResponse({
      success: true,
      payment,
    }, 201);
  } catch (error) {
    console.error('Payment submission error:', error);
    return errorResponse('Failed to submit payment', 500);
  }
}
