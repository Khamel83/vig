/**
 * Per-event payment endpoints for The Vig
 */

import type { Context } from 'astro';
import { payments, paymentSettings } from '@/lib/payments';
import { validateToken, extractToken } from '@/lib/auth';
import { events } from '@/lib/db';

export async function GET(context: Context): Promise<Response> {
  const token = extractToken(context.locals.request) ||
    context.locals.request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await validateToken(context.locals.runtime.env.DB, context.locals.runtime.env.JWT_SECRET, token);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const slug = context.locals.params.slug;
    const event = await events.getBySlug(context.locals.runtime.env.DB, slug);

    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin of the event
    if (!user.is_admin && event.created_by !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get payments for this event
    const eventPayments = await payments.getByEvent(context.locals.runtime.env.DB, event.id);
    const settings = await paymentSettings.getByEvent(context.locals.runtime.env.DB, event.id);

    return new Response(JSON.stringify({
      payments: eventPayments,
      settings,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching event payments:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch event payments' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function POST(context: Context): Promise<Response> {
  const token = extractToken(context.locals.request) ||
    context.locals.request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await validateToken(context.locals.runtime.env.DB, context.locals.runtime.env.JWT_SECRET, token);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const slug = context.locals.params.slug;
    const { amount_cents, method, transaction_id, notes } = await context.locals.request.json();

    const event = await events.getBySlug(context.locals.runtime.env.DB, slug);

    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin of the event
    if (!user.is_admin && event.created_by !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get event settings to validate amount
    const settings = await paymentSettings.getByEvent(context.locals.runtime.env.DB, event.id);
    if (!settings) {
      return new Response(JSON.stringify({ error: 'Payment settings not configured' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate amount matches entry fee
    if (amount_cents !== settings.entry_fee_cents) {
      return new Response(JSON.stringify({ error: `Amount must be ${settings.entry_fee_cents} cents` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create payment
    const payment = await payments.create(context.locals.runtime.env.DB, {
      event_id: event.id,
      user_id: user.id,
      amount_cents,
      method,
      transaction_id,
      notes,
    });

    return new Response(JSON.stringify(payment), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating event payment:', error);
    return new Response(JSON.stringify({ error: 'Failed to create payment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}