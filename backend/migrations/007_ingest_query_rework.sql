-- Migration 007: Ingest and Query redesign (replaces awbs_in_transit and awb_status_history)

-- 1. excel_import_batches
CREATE TABLE IF NOT EXISTS excel_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    source_message_id TEXT,
    original_filename TEXT,
    excel_template TEXT NOT NULL,
    excel_kind TEXT,
    excel_timezone_assumption TEXT,
    parser_version INT,
    ingested_at TIMESTAMPTZ DEFAULT now()
);

-- 2. excel_transport_lines
CREATE TABLE IF NOT EXISTS excel_transport_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    batch_id UUID NOT NULL REFERENCES excel_import_batches(id),
    first_batch_id UUID NOT NULL REFERENCES excel_import_batches(id),
    excel_template TEXT,
    shipment_id TEXT NOT NULL,
    job_number TEXT,
    leg_sequence INT NOT NULL,
    source TEXT NOT NULL DEFAULT 'excel',
    raw_excel_row JSONB NOT NULL,
    
    master_awb TEXT,
    house_ref TEXT,
    origin TEXT,
    destination TEXT,
    
    weight NUMERIC,
    weight_uq TEXT,
    outer_count NUMERIC,
    outer_uq TEXT,
    pieces_pcs NUMERIC,
    chargeable_weight_raw NUMERIC,
    
    first_leg_etd TIMESTAMPTZ,
    first_leg_atd TIMESTAMPTZ,
    israel_landing_eta TIMESTAMPTZ,
    israel_landing_ata TIMESTAMPTZ,
    
    leg_load_port TEXT,
    leg_discharge_port TEXT,
    leg_etd TIMESTAMPTZ,
    leg_ata TIMESTAMPTZ,
    leg_atd TIMESTAMPTZ,
    leg_eta TIMESTAMPTZ,
    
    customs_file_no TEXT,
    importer_name TEXT,
    exporter_name TEXT,
    incoterms_id TEXT,
    carrier_id TEXT,
    carrier_name TEXT,
    itr_date TIMESTAMPTZ,
    maman_swissport_departure TEXT,
    remarks TEXT,
    remarks_1 TEXT,
    remarks_2 TEXT,
    
    updated_atd TIMESTAMPTZ,
    atd_dsv_vs_airline TEXT,
    updated_eta TIMESTAMPTZ,
    eta_dsv_vs_airline TEXT,
    updated_ata TIMESTAMPTZ,
    ata_dsv_vs_airline TEXT,
    maman_swissport_intake_date TIMESTAMPTZ,
    maman_swissport_release_date TIMESTAMPTZ,
    release_vs_intake_date TEXT,
    
    origin_ctry TEXT,
    dest_ctry TEXT,
    inco TEXT,
    additional_terms TEXT,
    ppd_ccx TEXT,
    volume NUMERIC,
    volume_uq TEXT,
    chargeable NUMERIC,
    chargeable_uq TEXT,
    inner_count NUMERIC,
    inner_uq TEXT,
    shipment_event TEXT,
    
    values_original JSONB,
    values_latest JSONB,
    
    UNIQUE (tenant_id, shipment_id, leg_sequence)
);

-- 4. query_schedule (replaces awbs_in_transit)
CREATE TABLE IF NOT EXISTS query_schedule (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    mawb TEXT NOT NULL,
    hawb TEXT NOT NULL,
    next_status_check_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, mawb, hawb)
);

-- migrate any existing awbs_in_transit data over (if possible, though hawb is missing so maybe we skip)

-- 5. query_events
CREATE TABLE IF NOT EXISTS query_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    query_run_id UUID,
    mawb TEXT,
    hawb TEXT,
    shipment_id TEXT,
    leg_sequence INT,
    provider TEXT NOT NULL,
    source TEXT NOT NULL,
    occurred_at TIMESTAMPTZ,
    status_code TEXT,
    status_text TEXT,
    location TEXT,
    weight TEXT,
    pieces TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. leg_status_summary
CREATE TABLE IF NOT EXISTS leg_status_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    shipment_id TEXT NOT NULL,
    leg_sequence INT NOT NULL,
    aggregated_status TEXT,
    last_event_at TIMESTAMPTZ,
    summary JSONB,
    updated_at TIMESTAMPTZ,
    UNIQUE (tenant_id, shipment_id, leg_sequence)
);

-- 7. shipment_action_items
CREATE TABLE IF NOT EXISTS shipment_action_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    shipment_id TEXT NOT NULL,
    mawb TEXT,
    hawb TEXT,
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT,
    message TEXT,
    source TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_shipment_action_items_active ON shipment_action_items(tenant_id, shipment_id) WHERE is_active = true;

-- 8. excel_return_snapshots
CREATE TABLE IF NOT EXISTS excel_return_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    excel_template TEXT NOT NULL,
    shipment_count INT NOT NULL,
    diff_count INT NOT NULL,
    new_legs_count INT NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL,
    sent_to TEXT[] NOT NULL,
    sent_at TIMESTAMPTZ,
    metadata JSONB
);

-- Drop/Deprecate legacy
-- awb_status_history is deprecated but kept around for read-only tracking info in transition
-- awbs_in_transit will be replaced by query_schedule, so we should drop the awbs_in_transit
DROP TABLE IF EXISTS awbs_in_transit;
