-- Backfill domain_name in query_schedule for shipments ingested via Excel
UPDATE query_schedule qs
SET domain_name = split_part(b.sender_email, '@', 2)
FROM excel_import_batches b
JOIN excel_transport_lines etl ON etl.batch_id = b.id
WHERE qs.tenant_id = etl.tenant_id
  AND qs.mawb = etl.master_awb
  AND qs.hawb = COALESCE(etl.house_ref, etl.shipment_id)
  AND qs.domain_name IS NULL
  AND b.sender_email IS NOT NULL;
