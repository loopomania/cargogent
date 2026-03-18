CREATE TABLE IF NOT EXISTS query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    awb VARCHAR(50) NOT NULL,
    hawb VARCHAR(50),
    airline_code VARCHAR(20),
    status VARCHAR(50),
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_query_logs_awb ON query_logs(awb);
CREATE INDEX IF NOT EXISTS idx_query_logs_user ON query_logs(user_id);
