/**
 * Middleware utilities for API routes
 */

import type { D1Database } from '@cloudflare/workers-types';
import { extractToken, validateToken, type UserPublic } from './auth';
import { users } from './db';

export interface AuthContext {
  user: UserPublic;
}

// Require authentication
export async function requireAuth(
  request: Request,
  db: D1Database,
  jwtSecret: string
): Promise<AuthContext | Response> {
  const token = extractToken(request);
  if (!token) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = await validateToken(db, jwtSecret, token);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return { user };
}

// Require admin role
export async function requireAdmin(
  request: Request,
  db: D1Database,
  jwtSecret: string
): Promise<AuthContext | Response> {
  const authResult = await requireAuth(request, db, jwtSecret);
  if (authResult instanceof Response) return authResult;

  if (!authResult.user.is_admin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return authResult;
}

// Parse JSON body safely
export async function parseBody<T>(request: Request): Promise<T | Response> {
  try {
    return (await request.json()) as T;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Create JSON response
export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Create error response
export function errorResponse(message: string, status: number = 400): Response {
  return jsonResponse({ error: message }, status);
}
