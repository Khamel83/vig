import type { APIRoute } from 'astro';
import { extractToken, validateToken } from '@/lib/auth';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB } = runtime.env;

    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

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

    return new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Auth check error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
