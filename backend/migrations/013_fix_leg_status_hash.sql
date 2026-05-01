-- Migration: 013_fix_leg_status_hash.sql
-- Purpose: Fix the missing hash column on leg_status_summary that was accidentally assigned to awb_latest_status previously

ALTER TABLE leg_status_summary
  ADD COLUMN IF NOT EXISTS last_event_list_hash VARCHAR(64);
