-- Migration: 012_dynamic_intervals_and_errors.sql
-- Purpose: Support dynamic error thresholds and suspension logic natively

ALTER TABLE query_schedule
  ADD COLUMN IF NOT EXISTS error_count_consecutive INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_halted BOOLEAN NOT NULL DEFAULT false;

-- Add an index for quick 10-minute queue fetches ignoring halted shipments
CREATE INDEX IF NOT EXISTS idx_query_schedule_pending 
  ON query_schedule (next_status_check_at) 
  WHERE stale_alert_sent = false AND is_halted = false;
