import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
dotenv.config({ path: '../.env-prod' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  const excel = await pool.query(`
    SELECT SUM(pieces_pcs) as total
    FROM excel_transport_lines 
    WHERE master_awb = '01692075841' AND house_ref = 'ISR10056099'
  `);
  console.log("excel pieces:", excel.rows);
  
  const excelAll = await pool.query(`
    SELECT house_ref, pieces_pcs
    FROM excel_transport_lines 
    WHERE master_awb = '01692075841'
  `);
  console.table(excelAll.rows);
  pool.end();
}
main().catch(console.error);
