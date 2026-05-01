import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT leg_sequence, pieces_pcs 
    FROM excel_transport_lines 
    WHERE master_awb = '16083499931' AND house_ref = 'ISR10056000'
  `);
  console.log("Cathay ISR10056000 legs:", res.rows);
  
  const res2 = await client.query(`
    SELECT leg_sequence, pieces_pcs 
    FROM excel_transport_lines 
    WHERE master_awb = '02001360295' AND house_ref = 'ISR10055514'
  `);
  console.log("Lufthansa ISR10055514 legs:", res2.rows);

  await client.end();
}
run().catch(console.error);
