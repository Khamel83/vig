/**
 * Invitation system for The Vig
 * Handles invite code generation and validation for pool invitations
 */

import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

// Invitation types
export interface InviteCode {
  id: string;
  code: string;
  event_id: string;
  created_by: string;
  max_uses: number;
  uses: number;
  expires_at: number | null;
  created_at: number;
}

// Create a new invite code
export async function createInvite(
  db: D1Database,
  data: {
    event_id: string;
    created_by: string;
    max_uses?: number;
    expires_at?: number;
  }
): Promise<InviteCode> {
  const id = `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const code = generateInviteCode();
  const max_uses = data.max_uses || 1;
  const expires_at = data.expires_at || null;

  const stmt = await db.prepare(`
    INSERT INTO invite_codes (id, code, event_id, created_by, max_uses, uses, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
  `).bind(
    id,
    code,
    data.event_id,
    data.created_by,
    max_uses,
    0,
    expires_at
  );

  await stmt.run();

  return {
    id,
    code,
    event_id: data.event_id,
    created_by: data.created_by,
    max_uses,
    uses: 0,
    expires_at,
    created_at: Math.floor(Date.now() / 1000),
  };
}

// Get invite code by code
export async function getInviteByCode(db: D1Database, code: string): Promise<InviteCode | null> {
  const stmt = await db.prepare('SELECT * FROM invite_codes WHERE code = ?').bind(code);
  const result = await stmt.first();

  if (!result) return null;

  return {
    id: result.id,
    code: result.code,
    event_id: result.event_id,
    created_by: result.created_by,
    max_uses: result.max_uses,
    uses: result.uses,
    expires_at: result.expires_at,
    created_at: result.created_at,
  };
}

// Get invite codes by event
export async function getInvitesByEvent(db: D1Database, event_id: string): Promise<InviteCode[]> {
  const stmt = await db.prepare('SELECT * FROM invite_codes WHERE event_id = ? ORDER BY created_at DESC').bind(event_id);
  const results = await stmt.all();

  return results.results.map(result => ({
    id: result.id,
    code: result.code,
    event_id: result.event_id,
    created_by: result.created_by,
    max_uses: result.max_uses,
    uses: result.uses,
    expires_at: result.expires_at,
    created_at: result.created_at,
  }));
}

// Use an invite code
export async function useInvite(
  db: D1Database,
  kv: KVNamespace,
  code: string,
  user_id: string
): Promise<{ success: boolean; event_id?: string; error?: string }> {
  // Get invite code
  const invite = await getInviteByCode(db, code);
  if (!invite) {
    return { success: false, error: 'Invalid invitation code' };
  }

  // Check if invite is expired
  if (invite.expires_at && invite.expires_at < Math.floor(Date.now() / 1000)) {
    return { success: false, error: 'Invitation code has expired' };
  }

  // Check if max uses exceeded
  if (invite.uses >= invite.max_uses) {
    return { success: false, error: 'Invitation code has reached maximum uses' };
  }

  // Check if user has already used this invite
  const usedStmt = await db.prepare('SELECT 1 FROM event_participants WHERE event_id = ? AND user_id = ?').bind(
    invite.event_id,
    user_id
  );
  const alreadyUsed = await usedStmt.first();

  if (alreadyUsed) {
    return { success: false, error: 'You have already joined this pool' };
  }

  // Add user to event (this would be implemented based on your schema)
  const addStmt = await db.prepare(`
    INSERT INTO event_participants (event_id, user_id, joined_at)
    VALUES (?, ?, strftime('%s', 'now'))
  `).bind(invite.event_id, user_id);

  await addStmt.run();

  // Increment usage count
  const updateStmt = await db.prepare(`
    UPDATE invite_codes SET uses = uses + 1 WHERE code = ?
  `).bind(code);

  await updateStmt.run();

  // Cache invite in KV for fast lookup
  await kv.put(`invite_used:${code}:${user_id}`, '1', {
    expirationTtl: 3600, // 1 hour
  });

  return { success: true, event_id: invite.event_id };
}

// Generate random invite code
function generateInviteCode(): string {
  const prefix = Math.random().toString(36).substr(2, 3).toUpperCase();
  const number = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${number}`;
}

// Validate invite code (without using it)
export async function validateInvite(db: D1Database, code: string): Promise<{
  valid: boolean;
  event_id?: string;
  error?: string;
  expires_at?: number;
  uses_remaining?: number;
}> {
  const invite = await getInviteByCode(db, code);

  if (!invite) {
    return { valid: false, error: 'Invalid invitation code' };
  }

  if (invite.expires_at && invite.expires_at < Math.floor(Date.now() / 1000)) {
    return { valid: false, error: 'Invitation code has expired' };
  }

  const uses_remaining = invite.max_uses - invite.uses;

  return {
    valid: true,
    event_id: invite.event_id,
    expires_at: invite.expires_at,
    uses_remaining,
  };
}

// Revoke an invite code
export async function revokeInvite(db: D1Database, code: string): Promise<boolean> {
  const stmt = await db.prepare('DELETE FROM invite_codes WHERE code = ?').bind(code);
  const result = await stmt.run();

  return result.changes > 0;
}

// Extend invite expiration
export async function extendInviteExpiration(
  db: D1Database,
  code: string,
  new_expires_at: number
): Promise<boolean> {
  const stmt = await db.prepare(
    'UPDATE invite_codes SET expires_at = ? WHERE code = ?'
  ).bind(new_expires_at, code);

  const result = await stmt.run();

  return result.changes > 0;
}

// Get invite usage statistics
export async function getInviteStats(db: D1Database, event_id: string): Promise<{
  total_invites: number;
  total_used: number;
  active_invites: number;
}> {
  const totalStmt = await db.prepare('SELECT COUNT(*) as count FROM invite_codes WHERE event_id = ?').bind(event_id);
  const totalResult = await totalStmt.first();

  const usedStmt = await db.prepare('SELECT SUM(uses) as total FROM invite_codes WHERE event_id = ?').bind(event_id);
  const usedResult = await usedStmt.first();

  const activeStmt = await db.prepare(`
    SELECT COUNT(*) as count FROM invite_codes
    WHERE event_id = ? AND uses < max_uses AND (expires_at IS NULL OR expires_at > strftime('%s', 'now'))
  `).bind(event_id);
  const activeResult = await activeStmt.first();

  return {
    total_invites: totalResult.count,
    total_used: usedResult.total || 0,
    active_invites: activeResult.count,
  };
}