-- User notification preferences (PRD: Settings page)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS incremental_email_interval_hours INTEGER NOT NULL DEFAULT 2
    CHECK (incremental_email_interval_hours >= 1 AND incremental_email_interval_hours <= 4),
  ADD COLUMN IF NOT EXISTS full_report_times_per_day INTEGER NOT NULL DEFAULT 1
    CHECK (full_report_times_per_day >= 0 AND full_report_times_per_day <= 4);

-- AWB list / attention (extend stub awb_latest_status)
ALTER TABLE awb_latest_status
  ADD COLUMN IF NOT EXISTS hawb VARCHAR(64),
  ADD COLUMN IF NOT EXISTS requires_special_treatment BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN awb_latest_status.hawb IS 'House AWB; nullable for legacy rows until backfilled';
COMMENT ON COLUMN awb_latest_status.requires_special_treatment IS 'PRD: on-ground special treatment bucket when combined with ground-like latest_status';
