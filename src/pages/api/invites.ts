/**
 * Invite API endpoints for The Vig
 * Handles invite code creation, validation, and usage
 */

import type { Context } from 'astro';
import { createInvite, getInviteByCode, getInvitesByEvent, useInvite, validateInvite, revokeInvite } from '@/lib/invites';
import { validateToken } from '@/lib/auth';
import { events } from '@/lib/db';

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
    const { code, event_id } = context.locals.url.searchParams;

    if (code) {
      // Validate invite code
      const validation = await validateInvite(context.locals.runtime.env.DB, code);

      return new Response(JSON.stringify(validation), {
        status: validation.valid ? 200 : 400,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (event_id) {
      // Get invites for an event (admin only)
      if (!user.is_admin) {
        return new Response(JSON.stringify({ error: 'Unauthorized - Admin required' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const invites = await getInvitesByEvent(context.locals.runtime.env.DB, event_id);

      return new Response(JSON.stringify(invites), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Error handling invite:', error);
    return new Response(JSON.stringify({ error: 'Failed to process invite' }), {
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
    const { event_id, max_uses, expires_at } = await context.locals.request.json();

    if (!event_id) {
      return new Response(JSON.stringify({ error: 'Event ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin of the event
    const event = await events.getBySlug(context.locals.runtime.env.DB, event_id);
    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!user.is_admin && event.created_by !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create invite code
    const invite = await createInvite(context.locals.runtime.env.DB, {
      event_id,
      created_by: user.id,
      max_uses: max_uses || 1,
      expires_at: expires_at || null,
    });

    return new Response(JSON.stringify(invite), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    return new Response(JSON.stringify({ error: 'Failed to create invite' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function DELETE(context: Context): Promise<Response> {
  const token = context.locals.request.headers.get('Authorization')?.replace('Bearer ', '');
  const user = await validateToken(context.locals.runtime.env.DB, context.locals.runtime.env.JWT_SECRET, token);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { code } = await context.locals.request.json();

    if (!code) {
      return new Response(JSON.stringify({ error: 'Invite code required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if user is admin of the event
    const invite = await getInviteByCode(context.locals.runtime.env.DB, code);
    if (!invite) {
      return new Response(JSON.stringify({ error: 'Invite not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const event = await events.getBySlug(context.locals.runtime.env.DB, invite.event_id);
    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!user.is_admin && event.created_by !== user.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Revoke invite
    const revoked = await revokeInvite(context.locals.runtime.env.DB, code);

    return new Response(JSON.stringify({ success: revoked }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error revoking invite:', error);
    return new Response(JSON.stringify({ error: 'Failed to revoke invite' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}