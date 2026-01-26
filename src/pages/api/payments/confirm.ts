/**
 * Confirm payment endpoint (admin only)
 * POST /api/payments/confirm
 */

import { payments } from '@/lib/payments';
import { requireAdmin, jsonResponse, errorResponse, parseBody } from '@/lib/middleware';
import type { Context } from 'astro';

interface ConfirmPaymentRequest {
  payment_id: string;
  action: 'confirm' | 'reject';
  notes?: string;
}

export async function POST(context: Context): Promise<Response> {
  const { DB } = context.locals.runtime.env;

  // Require admin
  const authResult = await requireAdmin(
    context.locals.request,
    DB,
    context.locals.runtime.env.JWT_SECRET || ''
  );

  if (authResult instanceof Response) {
    return authResult;
  }

  // Parse request body
  const body = await parseBody<ConfirmPaymentRequest>(context.locals.request);
  if (body instanceof Response) {
    return body;
  }

  // Validate required fields
  if (!body.payment_id || !body.action) {
    return errorResponse('Missing required fields: payment_id, action');
  }

  // Validate action
  if (body.action !== 'confirm' && body.action !== 'reject') {
    return errorResponse('Action must be either "confirm" or "reject"');
  }

  try {
    const status = body.action === 'confirm' ? 'confirmed' : 'rejected';

    // Update payment status
    const updatedPayment = await payments.updateStatus(
      DB,
      body.payment_id,
      status,
      authResult.user.id,
      body.notes
    );

    if (!updatedPayment) {
      return errorResponse('Payment not found', 404);
    }

    // TODO: Send email notification to user
    // await sendPaymentStatusEmail(updatedPayment, status, body.notes);

    return jsonResponse({
      success: true,
      payment: updatedPayment,
    });
  } catch (error) {
    console.error('Payment confirmation error:', error);
    return errorResponse('Failed to update payment', 500);
  }
}
