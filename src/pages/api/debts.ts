/**
 * Debt API endpoints for The Vig
 */

import type { Context } from 'astro';
import { debts } from '@/lib/debts';
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
    const { status } = context.locals.url.searchParams;

    if (status) {
      // Get debts by status
      const debtsList = await debts.getByStatus(context.locals.runtime.env.DB, status as any);
      return new Response(JSON.stringify(debtsList), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      // Get user's debts summary
      const summary = await debts.getSummary(context.locals.runtime.env.DB, user.id);
      return new Response(JSON.stringify(summary), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error fetching debts:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch debts' }), {
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
    const { debtor_id, amount_cents, description } = await context.locals.request.json();

    if (!debtor_id || !amount_cents) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (amount_cents <= 0) {
      return new Response(JSON.stringify({ error: 'Amount must be positive' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get debtor user details
    const debtorUser = await users.getById(context.locals.runtime.env.DB, debtor_id);
    if (!debtorUser) {
      return new Response(JSON.stringify({ error: 'Debtor user not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create debt
    const debt = await debts.create(context.locals.runtime.env.DB, {
      creditor_id: user.id,
      debtor_id,
      amount_cents,
      description,
    });

    return new Response(JSON.stringify(debt), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating debt:', error);
    return new Response(JSON.stringify({ error: 'Failed to create debt' }), {
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
    const { id, status } = await context.locals.request.json();

    if (!id || !status) {
      return new Response(JSON.stringify({ error: 'ID and status required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get debt to check permissions
    const debt = await debts.getById(context.locals.runtime.env.DB, id);
    if (!debt) {
      return new Response(JSON.stringify({ error: 'Debt not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check permissions: debtor can mark as paid, creditor can cancel
    if (status === 'paid' && debt.debtor_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Only the debtor can mark a debt as paid' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (status === 'cancelled' && debt.creditor_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Only the creditor can cancel a debt' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update status
    const updatedDebt = await debts.updateStatus(
      context.locals.runtime.env.DB,
      id,
      status as any,
      user.id
    );

    if (!updatedDebt) {
      return new Response(JSON.stringify({ error: 'Failed to update debt' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updatedDebt), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating debt:', error);
    return new Response(JSON.stringify({ error: 'Failed to update debt' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}