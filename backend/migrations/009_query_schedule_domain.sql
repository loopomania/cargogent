-- Migration 009: Add domain_name to query_schedule

ALTER TABLE query_schedule ADD COLUMN IF NOT EXISTS domain_name TEXT;

-- Backfill domain_name from the users table for existing records
UPDATE query_schedule qs
SET domain_name = split_part((SELECT username FROM users u WHERE u.tenant_id = qs.tenant_id LIMIT 1), '@', 2)
WHERE domain_name IS NULL;
