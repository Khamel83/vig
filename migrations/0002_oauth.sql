-- Add Google OAuth2 support to users table
-- Migration: 0002_oauth.sql

-- Add OAuth fields to users table
ALTER TABLE users ADD COLUMN google_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;

-- Index for Google ID lookup (required for fast lookups)
CREATE INDEX idx_users_google_id ON users(google_id);

-- Update existing users with email_verified = 1 (assume existing users are verified)
UPDATE users SET email_verified = 1 WHERE google_id IS NULL;