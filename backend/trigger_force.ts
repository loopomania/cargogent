import { trackByAirline } from "./src/services/trackService.js";
import { getPool } from "./src/services/db.js";

async function run() {
  try {
    const res = await trackByAirline("aircanada", "01437625582", "ISR10055923");
    console.log(res.data.origin);
    console.log(res.data.destination);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
