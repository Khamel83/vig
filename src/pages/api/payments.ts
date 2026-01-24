/**
 * Payment API endpoints for The Vig
 * Handles payment submissions, status updates, and disputes
 */

import type { Context } from 'astro';
import { payments, paymentSettings, type PaymentMethod, type Payment } from '@/lib/payments';
import { validateToken } from '@/lib/auth';
import { users } from '@/lib/db';

export async function GET(context: Context): Promise<Response> {
  const token = context.locals.request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await validateToken(context.locals.runtime.env.DB, context.locals.runtime.env.JWT_SECRET, token);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get payments for the current user
    const userPayments = await payments.getByUser(context.locals.runtime.env.DB, user.id);

    return new Response(JSON.stringify(userPayments), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch payments' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(context: Context): Promise<Response> {
  const token = context.locals.request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await validateToken(context.locals.runtime.env.DB, context.locals.runtime.env.JWT_SECRET, token);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { event_id, amount_cents, method, transaction_id, notes } = await context.locals.request.json();

    if (!event_id || !amount_cents || !method) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate payment method
    if (!['venmo', 'cashapp', 'cash', 'other'].includes(method)) {
      return new Response(JSON.stringify({ error: 'Invalid payment method' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create payment
    const payment = await payments.create(context.locals.runtime.env.DB, {
      event_id,
      user_id: user.id,
      amount_cents,
      method: method as PaymentMethod,
      transaction_id,
      notes,
    });

    return new Response(JSON.stringify(payment), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    return new Response(JSON.stringify({ error: 'Failed to create payment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PATCH(context: Context): Promise<Response> {
  const token = context.locals.request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await validateToken(context.locals.runtime.env.DB, context.locals.runtime.env.JWT_SECRET, token);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { id, status, notes } = await context.locals.request.json();

    if (!id) {
      return new Response(JSON.stringify({ error: 'Payment ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get payment to check permissions
    const payment = await payments.getById(context.locals.runtime.env.DB, id);
    if (!payment) {
      return new Response(JSON.stringify({ error: 'Payment not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Only admins can confirm/reject payments, or users can update their own pending payments
    if (!user.is_admin && payment.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let updatedPayment;
    if (status && (status === 'confirmed' || status === 'rejected')) {
      // Admin actions
      if (!user.is_admin) {
        return new Response(JSON.stringify({ error: 'Only admins can confirm/reject payments' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      updatedPayment = await payments.updateStatus(
        context.locals.runtime.env.DB,
        id,
        status,
        user.id,
        notes
      );
    } else if (payment.user_id === user.id && payment.status === 'pending') {
      // User can add notes to their own payment
      updatedPayment = await payments.updateStatus(
        context.locals.runtime.env.DB,
        id,
        'pending',
        undefined,
        notes
      );
    } else {
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!updatedPayment) {
      return new Response(JSON.stringify({ error: 'Failed to update payment' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updatedPayment), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    return new Response(JSON.stringify({ error: 'Failed to update payment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}