/**
 * Google OAuth2 authentication handler using PKCE
 * No server-side OAuth2 secrets needed (client-side PKCE flow)
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// PKCE implementation
const PKCE_CODE_VERIFIER_LENGTH = 128;
const PKCE_CODE_CHALLENGE_LENGTH = 43;

export interface OAuthState {
  code_verifier: string;
  redirect_uri: string;
  user_data: {
    name: string;
    email: string;
    avatar_url?: string;
  };
}

// Generate secure random string for PKCE
export function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Generate PKCE code verifier and challenge
export function generatePKCE(): { code_verifier: string; code_challenge: string } {
  const code_verifier = generateRandomString(PKCE_CODE_VERIFIER_LENGTH);
  const code_challenge = encodeHash(code_verifier);
  return { code_verifier, code_challenge };
}

// Base64url encoding without padding (PKCE spec)
function encodeHash(data: string): string {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = crypto.subtle.digestSync('SHA-256', dataBuffer);
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Generate OAuth2 state parameter
export function generateOAuthState(): string {
  return generateRandomString(32);
}

// Store OAuth state in KV
export async function storeOAuthState(
  kv: KVNamespace,
  state: string,
  data: OAuthState,
  ttlSeconds: number = 600 // 10 minutes
): Promise<void> {
  await kv.put(`oauth_state:${state}`, JSON.stringify(data), {
    expirationTtl: ttlSeconds,
  });
}

// Retrieve OAuth state from KV
export async function getOAuthState(
  kv: KVNamespace,
  state: string
): Promise<OAuthState | null> {
  const data = await kv.get(`oauth_state:${state}`, 'json');
  return data as OAuthState | null;
}

// Remove OAuth state
export async function removeOAuthState(kv: KVNamespace, state: string): Promise<void> {
  await kv.delete(`oauth_state:${state}`);
}

// Get Google OAuth2 configuration
export function getGoogleOAuthConfig(clientId: string, redirectUri: string) {
  if (!clientId) {
    throw new Error('GOOGLE_OAUTH_CLIENT_ID environment variable is required');
  }

  return {
    clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email'],
  };
}

// Build Google OAuth2 authorization URL
export function buildGoogleAuthUrl(state: string, code_challenge: string, clientId: string, redirectUri: string): string {
  const config = getGoogleOAuthConfig(clientId, redirectUri);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state,
    code_challenge,
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Exchange code for tokens
interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token: string;
}

async function exchangeCodeForTokens(
  code: string,
  code_verifier: string,
  clientId: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const config = getGoogleOAuthConfig(clientId, redirectUri);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
    grant_type: 'authorization_code',
    code_verifier,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google OAuth token exchange failed: ${response.status} ${error}`);
  }

  return response.json();
}

// Decode Google ID token to get user info
interface GoogleUserInfo {
  sub: string;
  name: string;
  email: string;
  picture?: string;
  email_verified: boolean;
}

function decodeGoogleIdToken(id_token: string): GoogleUserInfo {
  const payload = id_token.split('.')[1];
  if (!payload) {
    throw new Error('Invalid Google ID token');
  }

  try {
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch (error) {
    throw new Error(`Failed to decode Google ID token: ${error}`);
  }
}

// Google OAuth2 flow
export async function handleGoogleOAuthCallback(
  code: string,
  state: string,
  code_verifier: string,
  db: D1Database,
  kv: KVNamespace,
  jwtSecret: string,
  clientId: string,
  redirectUri: string
): Promise<{ success: boolean; user?: any; token?: string; error?: string }> {
  try {
    // Verify state matches
    const oauthState = await getOAuthState(kv, state);
    if (!oauthState) {
      return { success: false, error: 'Invalid or expired state parameter' };
    }

    // Remove state after verification
    await removeOAuthState(kv, state);

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, code_verifier, clientId, redirectUri);

    // Decode ID token
    const userInfo = decodeGoogleIdToken(tokens.id_token);

    // Check if user exists by Google ID
    const userStmt = await db.prepare('SELECT * FROM users WHERE google_id = ?').bind(userInfo.sub);
    const existingUser = await userStmt.first();

    if (existingUser) {
      // User exists - login
      const token = await createJWTForUser(existingUser, jwtSecret);
      await storeSessionInKV(kv, token, existingUser.id);
      return { success: true, user: existingUser, token };
    } else {
      // New user - create account
      const insertStmt = await db.prepare(`
        INSERT INTO users (google_id, email, name, avatar_url, email_verified)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        userInfo.sub,
        userInfo.email,
        userInfo.name,
        userInfo.picture || null,
        userInfo.email_verified ? 1 : 0
      );
      await insertStmt.run();

      const newUser = await db.prepare('SELECT * FROM users WHERE google_id = ?').bind(userInfo.sub);
      const createdUser = await newUser.first();

      if (createdUser) {
        const token = await createJWTForUser(createdUser, jwtSecret);
        await storeSessionInKV(kv, token, createdUser.id);
        return { success: true, user: createdUser, token };
      } else {
        return { success: false, error: 'Failed to create user account' };
      }
    }
  } catch (error) {
    return { success: false, error: `OAuth2 error: ${error}` };
  }
}

// Helper to create JWT for user
async function createJWTForUser(user: any, jwtSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    is_admin: user.is_admin || 0,
    iat: now,
    exp: now + 30 * 24 * 60 * 60, // 30 days
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const message = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${message}.${signatureB64}`;
}

// Helper to store session in KV
async function storeSessionInKV(kv: KVNamespace, token: string, userId: string): Promise<void> {
  await kv.put(`session:${token}`, JSON.stringify({ user_id: userId }), {
    expirationTtl: 30 * 24 * 60 * 60, // 30 days
  });
}