import pg from 'pg';
const { Client } = pg;
import { readFileSync } from 'fs';

const connectionStrings = {
    DEV: "postgresql://cargogent:dev@localhost:5432/cargogent",
    PROD: "postgresql://neondb_owner:npg_ue2I7nZCKhJH@ep-broad-rain-alw95st3-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
};

const migrationFile = "migrations/007_ingest_query_rework.sql";
const sql = readFileSync(migrationFile, "utf-8");

async function runMigration(name, connectionString) {
    console.log(`Starting migration for ${name}...`);
    const client = new Client({ connectionString });
    try {
        await client.connect();
        await client.query("BEGIN;");
        await client.query(sql);
        await client.query("COMMIT;");
        console.log(`[SUCCESS] Migration 007 applied to ${name}!`);
    } catch (e) {
        await client.query("ROLLBACK;").catch(() => {});
        console.error(`[ERROR] Migration failed for ${name}: `, e.message);
    } finally {
        await client.end().catch(()=> { });
    }
}

async function runAll() {
    await runMigration("DEV", connectionStrings.DEV);
    await runMigration("PROD", connectionStrings.PROD);
}

runAll();
