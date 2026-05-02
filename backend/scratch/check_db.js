import pg from 'pg';
import dotenv from 'dotenv';

const dbUrl = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function checkUser() {
    const pool = new pg.Pool({ connectionString: dbUrl });
    try {
        console.log("Checking user: avlagondaniel@gmail.com");
        const userRes = await pool.query("SELECT * FROM users WHERE username = $1", ["avlagondaniel@gmail.com"]);
        console.log("User:", JSON.stringify(userRes.rows, null, 2));

        if (userRes.rows.length > 0) {
            const tenantId = userRes.rows[0].tenant_id;
            console.log("Checking tenant:", tenantId);
            const tenantRes = await pool.query("SELECT * FROM tenants WHERE id = $1", [tenantId]);
            console.log("Tenant:", JSON.stringify(tenantRes.rows, null, 2));

            console.log("Checking import batches for this tenant:");
            const batchesRes = await pool.query("SELECT * FROM excel_import_batches WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5", [tenantId]);
            console.log("Batches:", JSON.stringify(batchesRes.rows, null, 2));
        }

        console.log("Checking all users with gmail.com domain:");
        const gmailUsers = await pool.query("SELECT username, tenant_id FROM users WHERE username LIKE '%@gmail.com'");
        console.log("Gmail Users:", JSON.stringify(gmailUsers.rows, null, 2));

    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        await pool.end();
    }
}

checkUser();
