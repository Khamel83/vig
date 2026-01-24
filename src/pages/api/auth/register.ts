import type { APIRoute } from 'astro';
import { register } from '@/lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB, KV } = runtime.env;

    // Get JWT secret from env or generate a default (should be set in production)
    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    const body = await request.json();
    const result = await register(DB, KV, jwtSecret, body);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ user: result.user, token: result.token }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Register error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
