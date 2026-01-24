/**
 * Pool lifecycle management API
 */

import type { Context } from 'astro';
import { poolLifecycle, poolTemplates, type PoolStatus } from '@/lib/pools';
import { validateToken } from '@/lib/auth';
import { events } from '@/lib/db';

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
    const { status } = await context.locals.request.json();
    const poolId = context.locals.params.id;

    // Get pool and check permissions
    const pool = await events.getBySlug(context.locals.runtime.env.DB, poolId);
    if (!pool) {
      return new Response(JSON.stringify({ error: 'Pool not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Only pool creator or admin can manage lifecycle
    if (!user.is_admin && pool.created_by !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!status) {
      return new Response(JSON.stringify({ error: 'Status required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if transition is valid
    const currentLifecycle = await poolLifecycle.get(context.locals.runtime.env.DB, poolId);
    if (!currentLifecycle) {
      return new Response(JSON.stringify({ error: 'Pool lifecycle not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const canTransition = await poolLifecycle.canTransition(
      context.locals.runtime.env.DB,
      poolId,
      currentLifecycle.status,
      status
    );

    if (!canTransition) {
      return new Response(JSON.stringify({ error: 'Invalid state transition' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update status
    const updated = await poolLifecycle.updateStatus(
      context.locals.runtime.env.DB,
      poolId,
      status as PoolStatus,
      user.id
    );

    if (!updated) {
      return new Response(JSON.stringify({ error: 'Failed to update pool status' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(updated), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error updating pool lifecycle:', error);
    return new Response(JSON.stringify({ error: 'Failed to update pool lifecycle' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}