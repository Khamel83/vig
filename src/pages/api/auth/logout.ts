import type { APIRoute } from 'astro';
import { logout, extractToken } from '@/lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { runtime } = locals;
    const { DB, KV } = runtime.env;

    const token = extractToken(request);
    if (token) {
      // Logout invalidates the session (best effort)
      try {
        await logout(DB, KV, token);
      } catch {
        // Ignore errors - token might not be in session store
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Logout error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
