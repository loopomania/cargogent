-- Migration 015: Add error_message to query_logs to track why trackers failed

ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS error_message TEXT;
