/**
 * Google OAuth2 complete endpoint
 * Exchanges authorization code for access tokens and creates user session
 */

import { handleGoogleOAuthCallback } from '@/lib/oauth-google';
import type { Context } from 'astro';

export async function POST(context: Context): Promise<Response> {
  const { DB, KV, JWT_SECRET, GOOGLE_OAUTH_CLIENT_ID, SITE_URL } = context.locals.runtime.env;

  try {
    const { code, state, code_verifier } = await context.locals.request.json();

    if (!code || !state || !code_verifier) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const clientId = GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = `${SITE_URL}/api/auth/google-callback`;

    // Handle OAuth callback
    const result = await handleGoogleOAuthCallback(
      code,
      state,
      code_verifier,
      DB,
      KV,
      JWT_SECRET,
      clientId,
      redirectUri
    );

    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Google OAuth complete error:', error);
    return new Response(JSON.stringify({ error: 'Authentication failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}