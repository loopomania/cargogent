import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
import { saveTrackingResult } from '../src/routes/track.js';
import { getPool } from '../src/services/db.js';

const rawJson = {"airline":"elal","awb":"114-63893690","hawb":null,"origin":"TLV","destination":"EWR","status":"Status DLV","flight":"LY 025","etd":null,"eta":null,"events":[{"status_code":"FOH","status":"Status FOH","location":"TLV","date":"2026-04-19 14:13","estimated_date":null,"pieces":"17","weight":"3608.0","remarks":null,"flight":null,"customs":null,"source":null},{"status_code":"DEP","status":"Departed LY 0025 from TLV","location":"TLV","date":"2026-04-20 01:04","estimated_date":null,"pieces":"17","weight":"3608.0","remarks":"Flight LY 0025 to EWR","flight":"LY 0025","customs":null,"source":null},{"status_code":"ARR","status":"Arrived LY 0025 at EWR","location":"EWR","date":"2026-04-20 05:52","estimated_date":null,"pieces":"17","weight":"3608.0","remarks":"Flight LY 0025 from TLV","flight":"LY 0025","customs":null,"source":null},{"status_code":"RCF","status":"Status RCF","location":"EWR","date":"2026-04-20 09:58","estimated_date":null,"pieces":"17","weight":"3608.0","remarks":null,"flight":"LY 025","customs":null,"source":null},{"status_code":"NFD","status":"Status NFD","location":"EWR","date":"2026-04-21 09:58","estimated_date":null,"pieces":"17","weight":"3608.0","remarks":"CHOICE AVIATION SERVICES","flight":null,"customs":null,"source":null},{"status_code":"DLV","status":"Status DLV","location":"EWR","date":"2026-04-21 09:58","estimated_date":null,"pieces":"17","weight":"3608.0","remarks":"CHOICE AVIATION SERVICES","flight":null,"customs":null,"source":null}],"message":"Success","blocked":false,"raw_meta":{"trace":["init_playwright_cdp","connecting_ws","farming_akamai_telemetry_pw","akamai_cookies_upgraded_pw","legacy_text_len:592","legacy_parse_success"],"durations":{"airline":17.8,"ground":0.0}}};

async function main() {
  const p = getPool();
  
  // Find tenant and hawbs
  const res = await p.query(`SELECT tenant_id, hawb FROM query_schedule WHERE mawb = '11463893690'`);
  for (const row of res.rows) {
      await saveTrackingResult(row.tenant_id, '11463893690', row.hawb, rawJson);
      console.log("Injected delivered data for", row.hawb);
  }
}
main().catch(console.error).finally(() => process.exit(0));
