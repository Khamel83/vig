/**
 * Dashboard data endpoint
 * GET /api/dashboard
 * Returns user's dashboard data including payments, pools, picks, and games
 */

import { extractToken, validateToken } from '@/lib/auth';
import { payments } from '@/lib/payments';
import { users } from '@/lib/db';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;

    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    // Get user from token
    const token = extractToken(request);
    if (!token) {
      return new Response(JSON.stringify({ error: 'No token provided' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = await validateToken(DB, jwtSecret, token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user's payments
    const userPayments = await payments.getByUser(DB, user.id);

    // Get user's pools (events they're participating in)
    const poolsStmt = await DB.prepare(`
      SELECT e.*, ep.joined_at
      FROM events e
      INNER JOIN event_participants ep ON e.id = ep.event_id
      WHERE ep.user_id = ?
      ORDER BY e.created_at DESC
    `).bind(user.id);
    const poolsResult = await poolsStmt.all();
    const userPools = poolsResult.results;

    // Get user's picks
    const picksStmt = await DB.prepare(`
      SELECT s.*, o.name as option_name, e.name as event_name, e.slug as event_slug
      FROM selections s
      INNER JOIN options o ON s.option_id = o.id
      INNER JOIN events e ON s.event_id = e.id
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
      LIMIT 20
    `).bind(user.id);
    const picksResult = await picksStmt.all();
    const userPicks = picksResult.results;

    // Get upcoming games (for events user is participating in)
    const gamesStmt = await DB.prepare(`
      SELECT g.*, e.name as event_name, e.slug as event_slug,
             ht.name as home_team_name, at.name as away_team_name
      FROM games g
      INNER JOIN events e ON g.event_id = e.id
      INNER JOIN event_participants ep ON e.id = ep.event_id
      LEFT JOIN options ht ON g.home_team_id = ht.id
      LEFT JOIN options at ON g.away_team_id = at.id
      WHERE ep.user_id = ?
        AND g.status = 'scheduled'
        AND g.scheduled_at > strftime('%s', 'now')
      ORDER BY g.scheduled_at ASC
      LIMIT 10
    `).bind(user.id);
    const gamesResult = await gamesStmt.all();
    const upcomingGames = gamesResult.results;

    // Enrich payments with event details
    const paymentsWithEvent = await Promise.all(
      userPayments.map(async (payment: any) => {
        const eventStmt = await DB.prepare(
          'SELECT id, name, sport FROM events WHERE id = ?'
        ).bind(payment.event_id);
        const event = await eventStmt.first();

        return {
          ...payment,
          event: event || null,
        };
      })
    );

    return new Response(JSON.stringify({
      user,
      payments: paymentsWithEvent,
      pools: userPools,
      picks: userPicks,
      upcomingGames,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
