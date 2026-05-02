const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://cargogent:cargogent@localhost:5432/cargogent'
});
pool.query("SELECT events FROM trackers WHERE awb='01437625582'", (err, res) => {
  if(err) console.error(err);
  else {
      const fs = require('fs');
      fs.writeFileSync('../scratch/db_events.json', JSON.stringify(res.rows, null, 2));
      console.log('saved');
  }
  pool.end();
});
