import pg from 'pg';
const { Client } = pg;
import { readFileSync } from 'fs';

const PROD = "postgresql://neondb_owner:npg_ue2I7nZCKhJH@ep-broad-rain-alw95st3-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const migrationFile = "migrations/007_ingest_query_rework.sql";
const sql = readFileSync(migrationFile, "utf-8");

async function runProd() {
    console.log(`Starting migration for PROD...`);
    const client = new Client({ connectionString: PROD });
    try {
        await client.connect();
        await client.query("BEGIN;");
        await client.query(sql);
        await client.query("COMMIT;");
        console.log(`[SUCCESS] Migration 007 applied to PROD!`);
    } catch (e) {
        await client.query("ROLLBACK;").catch(() => {});
        console.error(`[ERROR] Migration failed for PROD: `, e.message);
    } finally {
        await client.end().catch(()=> { });
    }
}

runProd();
