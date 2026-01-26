-- Make password_hash nullable to support OAuth-only users
-- Migration: 0006_oauth_password_nullable.sql

-- SQLite doesn't support ALTER COLUMN directly, need to recreate table
BEGIN TRANSACTION;

-- Create new users table with nullable password_hash
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
INSERT INTO users_new (id, email, password_hash, name, google_id, avatar_url, email_verified, is_admin, created_at)
SELECT id, email, password_hash, name, google_id, avatar_url, email_verified, is_admin, created_at
FROM users;

-- Drop old table
DROP TABLE users;

-- Rename new table
ALTER TABLE users_new RENAME TO users;

-- Recreate indexes
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email ON users(email);

COMMIT;
