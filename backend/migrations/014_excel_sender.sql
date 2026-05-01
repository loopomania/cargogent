-- Migration 014: Add sender_email to excel_import_batches to track ingested email domains accurately

ALTER TABLE excel_import_batches ADD COLUMN IF NOT EXISTS sender_email TEXT;
