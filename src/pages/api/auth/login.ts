import type { APIRoute } from 'astro';
import { login } from '@/lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB, KV } = runtime.env;

    const jwtSecret = runtime.env.JWT_SECRET || 'vig-dev-secret-change-in-production';

    const body = await request.json();
    const result = await login(DB, KV, jwtSecret, body);

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ user: result.user, token: result.token }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Login error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
