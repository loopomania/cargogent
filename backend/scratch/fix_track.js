const fs = require('fs');
const file = 'src/routes/track.ts';
let code = fs.readFileSync(file, 'utf8');

// We need a helper to get the tenant_id for a shipment.
const helperStr = `
async function getActualTenantId(user: any, awb: string, hawb?: string): Promise<string | undefined> {
  if (user?.tenant_id) return user.tenant_id;
  const p = getPool();
  if (!p) return undefined;
  try {
    const res = await p.query(
      "SELECT tenant_id FROM leg_status_summary WHERE shipment_id = $1 LIMIT 1",
      [hawb || awb.replace(/-/g, "")]
    );
    return res.rows[0]?.tenant_id;
  } catch (err) {
    return undefined;
  }
}
`;

if (!code.includes('getActualTenantId')) {
  code = code.replace('async function appendExcelDatesToTrackingData', helperStr + '\nasync function appendExcelDatesToTrackingData');
}

// Fix trackByAirline
code = code.replace(
  /await appendExcelDatesToTrackingData\(user\?\.tenant_id, awb, hawb as string \| undefined, data\);/g,
  `const tenantId = await getActualTenantId(user, awb, hawb as string | undefined);
    await appendExcelDatesToTrackingData(tenantId, awb, hawb as string | undefined, data);`
);

fs.writeFileSync(file, code);
