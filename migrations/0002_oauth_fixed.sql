-- Add Google OAuth2 support to users table
-- Migration: 0002_oauth.sql

-- SQLite doesn't support ALTER TABLE to add UNIQUE column directly
-- Need to recreate the table
BEGIN TRANSACTION;

-- Create new users table with OAuth fields and nullable password_hash
CREATE TABLE users_new (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    name TEXT NOT NULL,
    google_id TEXT UNIQUE,
    avatar_url TEXT,
    email_verified INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Copy existing data
INSERT INTO users_new (id, email, password_hash, name, is_admin, created_at)
SELECT id, email, password_hash, name, is_admin, created_at
FROM users;

-- Set email_verified = 1 for existing users
UPDATE users_new SET email_verified = 1 WHERE password_hash IS NOT NULL;

-- Drop old table
DROP TABLE users;

-- Rename new table
ALTER TABLE users_new RENAME TO users;

-- Recreate indexes
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email ON users(email);

COMMIT;
