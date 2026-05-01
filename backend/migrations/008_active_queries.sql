-- Migration 008: Add timestamp columns to query_schedule for tracking active query duration

ALTER TABLE query_schedule 
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_check_at TIMESTAMPTZ;

-- Backfill last_check_at for existing records so it's not null immediately
UPDATE query_schedule SET last_check_at = NOW() WHERE last_check_at IS NULL;
