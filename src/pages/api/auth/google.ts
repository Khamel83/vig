/**
 * Google OAuth2 start endpoint
 * Generates PKCE flow and redirects to Google
 */

import { buildGoogleAuthUrl, generateOAuthState } from '@/lib/oauth-google';
import type { Context } from 'astro';

const PKCE_CODE_VERIFIER_LENGTH = 128;

export async function GET(context: Context): Promise<Response> {
  const { kv, GOOGLE_OAUTH_CLIENT_ID, SITE_URL } = context.locals.runtime.env;

  // Get invite code from query params (for join flow)
  const inviteCode = context.locals.url.searchParams.get('invite_code');

  // Generate OAuth state and PKCE challenge
  const state = generateOAuthState();
  const { code_challenge } = generatePKCE();

  const clientId = GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = `${SITE_URL}/api/auth/google-callback`;

  // Store OAuth state in KV with redirect_uri and invite code
  await storeOAuthState(kv, state, {
    code_verifier: generateRandomString(PKCE_CODE_VERIFIER_LENGTH),
    redirect_uri: redirectUri,
    user_data: {
      invite_code: inviteCode || undefined,
    },
  });

  // Build Google auth URL
  const authUrl = buildGoogleAuthUrl(state, code_challenge, clientId, redirectUri);

  // Return 302 redirect to Google
  return Response.redirect(authUrl, 302);
}

// Helper functions (moved inline for this endpoint)
async function storeOAuthState(kv: KVNamespace, state: string, data: any, ttlSeconds: number = 600): Promise<void> {
  await kv.put(`oauth_state:${state}`, JSON.stringify(data), {
    expirationTtl: ttlSeconds,
  });
}

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function generatePKCE(): { code_challenge: string } {
  const code_verifier = generateRandomString(PKCE_CODE_VERIFIER_LENGTH);
  const code_challenge = encodeHash(code_verifier);
  return { code_challenge };
}

function encodeHash(data: string): string {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = crypto.subtle.digestSync('SHA-256', dataBuffer);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}