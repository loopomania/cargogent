-- Add display name to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
