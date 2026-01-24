/**
 * Auth utilities for The Vig
 * Password hashing using Web Crypto API (Cloudflare Workers compatible)
 * JWT generation and verification
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { users, sessions, type User, type UserPublic } from './db';

// Password hashing with PBKDF2 (Web Crypto API)
const PBKDF2_ITERATIONS = 100000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8
  );

  const hash = new Uint8Array(derivedBits);
  const combined = new Uint8Array(SALT_LENGTH + KEY_LENGTH);
  combined.set(salt);
  combined.set(hash, SALT_LENGTH);

  return btoa(String.fromCharCode(...combined));
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const combined = Uint8Array.from(atob(storedHash), (c) => c.charCodeAt(0));
    const salt = combined.slice(0, SALT_LENGTH);
    const storedKey = combined.slice(SALT_LENGTH);

    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      KEY_LENGTH * 8
    );

    const derivedKey = new Uint8Array(derivedBits);

    // Constant-time comparison
    if (derivedKey.length !== storedKey.length) return false;
    let result = 0;
    for (let i = 0; i < derivedKey.length; i++) {
      result |= derivedKey[i] ^ storedKey[i];
    }
    return result === 0;
  } catch {
    return false;
  }
}

// JWT implementation using Web Crypto (HMAC-SHA256)
interface JWTPayload {
  sub: string; // user id
  email: string;
  name: string;
  is_admin: boolean;
  iat: number;
  exp: number;
}

function base64UrlEncode(data: Uint8Array | string): string {
  const str = typeof data === 'string' ? data : String.fromCharCode(...data);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

async function getSigningKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createJWT(
  user: User | UserPublic,
  secret: string,
  expiresIn: number = 30 * 24 * 60 * 60 // 30 days
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    is_admin: typeof user.is_admin === 'number' ? user.is_admin === 1 : user.is_admin,
    iat: now,
    exp: now + expiresIn,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const message = `${headerB64}.${payloadB64}`;

  const key = await getSigningKey(secret);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));

  return `${message}.${signatureB64}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const message = `${headerB64}.${payloadB64}`;

    // Verify signature
    const key = await getSigningKey(secret);
    const encoder = new TextEncoder();
    const signature = Uint8Array.from(base64UrlDecode(signatureB64), (c) => c.charCodeAt(0));

    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(message));
    if (!valid) return null;

    // Parse and validate payload
    const payload: JWTPayload = JSON.parse(base64UrlDecode(payloadB64));

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

// Auth service functions
export interface AuthResult {
  success: boolean;
  user?: UserPublic;
  token?: string;
  error?: string;
}

export async function register(
  db: D1Database,
  kv: KVNamespace,
  jwtSecret: string,
  data: { email: string; password: string; name: string }
): Promise<AuthResult> {
  // Validate input
  if (!data.email || !data.password || !data.name) {
    return { success: false, error: 'Missing required fields' };
  }

  if (data.password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }

  // Check if user exists
  const existing = await users.getByEmail(db, data.email.toLowerCase());
  if (existing) {
    return { success: false, error: 'Email already registered' };
  }

  // Create user
  const passwordHash = await hashPassword(data.password);
  const user = await users.create(db, {
    email: data.email.toLowerCase(),
    password_hash: passwordHash,
    name: data.name,
  });

  // Create session and JWT
  const session = await sessions.create(db, user.id);
  const token = await createJWT(user, jwtSecret);

  // Store session in KV for fast lookups
  await kv.put(`session:${session.token}`, JSON.stringify({ user_id: user.id }), {
    expirationTtl: 30 * 24 * 60 * 60,
  });

  return {
    success: true,
    user: users.toPublic(user),
    token,
  };
}

export async function login(
  db: D1Database,
  kv: KVNamespace,
  jwtSecret: string,
  data: { email: string; password: string }
): Promise<AuthResult> {
  // Validate input
  if (!data.email || !data.password) {
    return { success: false, error: 'Missing required fields' };
  }

  // Find user
  const user = await users.getByEmail(db, data.email.toLowerCase());
  if (!user) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Verify password
  const valid = await verifyPassword(data.password, user.password_hash);
  if (!valid) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Create session and JWT
  const session = await sessions.create(db, user.id);
  const token = await createJWT(user, jwtSecret);

  // Store session in KV
  await kv.put(`session:${session.token}`, JSON.stringify({ user_id: user.id }), {
    expirationTtl: 30 * 24 * 60 * 60,
  });

  return {
    success: true,
    user: users.toPublic(user),
    token,
  };
}

export async function logout(db: D1Database, kv: KVNamespace, sessionToken: string): Promise<void> {
  await sessions.delete(db, sessionToken);
  await kv.delete(`session:${sessionToken}`);
}

export async function validateToken(
  db: D1Database,
  jwtSecret: string,
  token: string
): Promise<UserPublic | null> {
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) return null;

  const user = await users.getById(db, payload.sub);
  if (!user) return null;

  return users.toPublic(user);
}

// Extract token from Authorization header
export function extractToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}
