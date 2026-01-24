/**
 * Google OAuth2 callback endpoint
 * Handles the redirect from Google and exchanges code for tokens
 */

import type { Context } from 'astro';

export async function GET(context: Context): Promise<Response> {
  const { code, state, error } = context.locals.url.searchParams;
  const { DB, KV, JWT_SECRET, GOOGLE_OAUTH_CLIENT_ID } = context.locals.runtime.env;

  // Check for errors from Google
  if (error) {
    return new Response(JSON.stringify({ error: `Google OAuth error: ${error}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate required parameters
  if (!code || !state) {
    return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get OAuth state from KV
    const stateData = await KV.get(`oauth_state:${state}`, 'json');
    if (!stateData) {
      return new Response(JSON.stringify({ error: 'Invalid or expired state' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Remove state after verification
    await KV.delete(`oauth_state:${state}`);

    // Call the OAuth callback handler
    const response = await fetch(`${context.locals.runtime.env.SITE_URL}/api/auth/google-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        state,
        code_verifier: stateData.code_verifier,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Set session cookie
    return new Response(JSON.stringify({ success: true, user: result.user }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `vig_session=${result.token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`, // 30 days
      },
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return new Response(JSON.stringify({ error: 'Authentication failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}