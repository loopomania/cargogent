import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    // 1. Mark next_status_check_at to NOW() so the worker picks it up immediately
    await pool.query(`
        UPDATE query_schedule 
        SET next_status_check_at = NOW() 
        WHERE mawb = '01692075804'
    `);
    console.log("Forced query_schedule check for 01692075804");
    
    // 2. Wait a bit for the worker to process it
    console.log("Waiting 15 seconds for production worker to track it...");
    await new Promise(r => setTimeout(r, 15000));
    
    // 3. Fetch latest events
    const qs = await pool.query(`
        SELECT status_code, pieces, occurred_at, location, status_text
        FROM query_events
        WHERE mawb = '01692075804'
        ORDER BY occurred_at DESC
        LIMIT 5
    `);
    console.log("Latest DB Events after worker sync:");
    qs.rows.forEach(r => console.log(r));
    
    pool.end();
}
main().catch(console.error);
