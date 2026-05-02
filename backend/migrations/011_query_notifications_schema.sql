-- 1. Create the dedicated change table to queue events for N8N Notifications
CREATE TABLE IF NOT EXISTS awb_latest_change (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  mawb VARCHAR(64) NOT NULL,
  hawb VARCHAR(64),
  event_type VARCHAR(64) NOT NULL, -- e.g. STATUS_CHANGE, STALE_24H, DISCREPANCY
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, -- dynamic details like { diff: "..." }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_by_n8n BOOLEAN NOT NULL DEFAULT false
);

-- Index to quickly pull unprocessed rows
CREATE INDEX IF NOT EXISTS idx_awb_latest_change_unprocessed ON awb_latest_change (tenant_id) WHERE processed_by_n8n = false;

-- 2. Modify query_schedule to keep track of inactivity for 24h thresholds
ALTER TABLE query_schedule
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS stale_alert_sent BOOLEAN NOT NULL DEFAULT false;

-- 3. Modify awb_latest_status cache (already has status but just in case we need fields)
ALTER TABLE awb_latest_status
  ADD COLUMN IF NOT EXISTS last_event_list_hash VARCHAR(64); -- Helper column to easily diff identical JSON structures

