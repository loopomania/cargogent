-- Enable pgcrypto for generating bcrypt hashes inside the database
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  access_key_hash TEXT,
  role TEXT DEFAULT 'user',
  tenant_id UUID REFERENCES tenants(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert the default admin user if it doesn't exist
INSERT INTO users (username, password_hash, role, tenant_id)
VALUES (
  'alon@cargogent.com',
  crypt('!A2sQWxz!ZX@', gen_salt('bf', 10)),
  'admin',
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (username) DO NOTHING;
