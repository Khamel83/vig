/**
 * Create pool from template API endpoint
 */

import type { Context } from 'astro';
import { poolTemplates, poolLifecycle } from '@/lib/pools';
import { createInvite } from '@/lib/invites';
import { validateToken } from '@/lib/auth';
import { events } from '@/lib/db';
import { crypto } from '@cloudflare/workers-types';

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
    const { template_id, name, entry_fee_cents, payment_deadline, max_uses } = await context.locals.request.json();

    if (!template_id || !name || !entry_fee_cents) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get template
    const template = await poolTemplates.getById(context.locals.runtime.env.DB, template_id);
    if (!template) {
      return new Response(JSON.stringify({ error: 'Template not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create pool (draft status)
    const poolId = `pool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const finalSlug = `${slug}-${template.sport.toLowerCase().replace(' ', '')}`;

    const eventStmt = await context.locals.runtime.env.DB.prepare(`
      INSERT INTO events (id, slug, name, description, sport, pool_type, status, max_selections, config, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
    `).bind(
      poolId,
      finalSlug,
      name,
      template.description,
      template.sport,
      template.pool_type,
      'draft',
      template.config.max_selections,
      JSON.stringify(template.config),
      user.id
    );

    await eventStmt.run();

    // Set template for the pool
    await poolLifecycle.setTemplate(context.locals.runtime.env.DB, poolId, template_id, template.version);

    // Create invite code
    const invite = await createInvite(context.locals.runtime.env.DB, {
      event_id: poolId,
      created_by: user.id,
      max_uses: max_uses || 1,
      expires_at: payment_deadline || Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days from now
    });

    // Set payment settings
    const paymentSettingsStmt = await context.locals.runtime.env.DB.prepare(`
      INSERT INTO payment_settings (id, event_id, entry_fee_cents, payment_deadline, prize_structure, payment_methods, payment_instructions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      `settings_${poolId}`,
      poolId,
      entry_fee_cents,
      payment_deadline,
      JSON.stringify({ '1st': 0.5, '2nd': 0.3, '3rd': 0.2 }), // Default prize structure
      JSON.stringify(['venmo', 'cashapp']), // Default payment methods
      'Payment details provided by pool admin'
    );

    await paymentSettingsStmt.run();

    return new Response(JSON.stringify({
      success: true,
      pool_id: poolId,
      slug: finalSlug,
      invite_code: invite.code,
      created_at: Math.floor(Date.now() / 1000),
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating pool from template:', error);
    return new Response(JSON.stringify({ error: 'Failed to create pool' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}