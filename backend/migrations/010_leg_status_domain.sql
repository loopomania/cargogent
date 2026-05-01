-- Migration 010: Add domain_name to leg_status_summary

ALTER TABLE leg_status_summary ADD COLUMN IF NOT EXISTS domain_name TEXT;

-- Backfill domain_name from the users table for historical records
UPDATE leg_status_summary ls
SET domain_name = split_part((SELECT username FROM users u WHERE u.tenant_id = ls.tenant_id LIMIT 1), '@', 2)
WHERE domain_name IS NULL;
