import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../../../.env") });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
    console.log("Starting Neon DB Migration for hawb_mawb_lines...");
    const client = await pool.connect();
    
    try {
        await client.query("BEGIN");
        
        console.log("1. Creating hawb_mawb_lines table...");
        await client.query(`
            CREATE TABLE IF NOT EXISTS hawb_mawb_lines (
                tenant_id UUID NOT NULL,
                hawb VARCHAR(255) NOT NULL,
                mawb VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (tenant_id, hawb, mawb)
            );
        `);
        
        console.log("2. Skipping migration of existing data (hawb column does not exist in old schema).");

        
        // Note: As per architecture decisions, we are building the hawb_mawb_lines mapping table.
        // We will leave the existing awb_number column in awb_latest_status alone for now to avoid
        // completely breaking backward compatibility across n8n orchestrations until they are fully migrated
        // to write uniquely to hawb_mawb_lines.
        
        await client.query("COMMIT");
        console.log("Migration successfully committed!");
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("Migration failed, rolled back.", e);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
