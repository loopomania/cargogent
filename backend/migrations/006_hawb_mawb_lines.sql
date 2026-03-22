-- Migration 006: Create Many-to-Many HAWB/MAWB mapping table

CREATE TABLE IF NOT EXISTS hawb_mawb_lines (
    tenant_id UUID NOT NULL,
    hawb VARCHAR(255) NOT NULL,
    mawb VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (tenant_id, hawb, mawb)
);
