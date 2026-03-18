-- Minimal schema for CargoGent (multi-tenant).
-- Run against local Postgres in dev. Production uses Neon (apply same schema there).

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  notification_email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default tenant
INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000000', 'System Default') ON CONFLICT (id) DO NOTHING;

-- AWB tables (stub columns; expand per System-requirements.md)
CREATE TABLE IF NOT EXISTS awb_latest_status (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  awb_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  awb_number TEXT NOT NULL,
  latest_status TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS awb_status_history (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  awb_id UUID NOT NULL,
  history_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT,
  status_details JSONB,
  checked_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS awbs_in_transit (
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  awb_id UUID NOT NULL,
  next_status_check_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, awb_id)
);

CREATE INDEX IF NOT EXISTS idx_awb_latest_tenant ON awb_latest_status(tenant_id);
CREATE INDEX IF NOT EXISTS idx_awb_history_tenant ON awb_status_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_awbs_in_transit_next ON awbs_in_transit(next_status_check_at);
