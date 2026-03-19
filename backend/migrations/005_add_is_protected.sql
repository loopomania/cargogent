-- HIGH-05: Add is_protected column to prevent deletion of the superadmin account.
-- No longer relies on hardcoded email in application code.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT false;

-- Mark the seeded admin account as protected.
UPDATE users SET is_protected = true WHERE username = 'alon@cargogent.com';
