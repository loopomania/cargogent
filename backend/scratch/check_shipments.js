import pg from 'pg';

const dbUrl = "postgresql://neondb_owner:npg_Ht3uJXB7pfzh@ep-sweet-hat-alo7706n-pooler.c-3.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

async function checkShipments() {
    const pool = new pg.Pool({ connectionString: dbUrl });
    try {
        const tenantId = '00000000-0000-0000-0000-000000000000';
        console.log("Checking shipments for tenant:", tenantId);
        const shipments = await pool.query("SELECT COUNT(*) FROM excel_transport_lines WHERE tenant_id = $1", [tenantId]);
        console.log("Total transport lines:", shipments.rows[0].count);

        const recentLines = await pool.query("SELECT shipment_id, master_awb, house_ref, batch_id FROM excel_transport_lines WHERE tenant_id = $1 ORDER BY id DESC LIMIT 5", [tenantId]);
        console.log("Recent lines:", JSON.stringify(recentLines.rows, null, 2));

    } catch (err) {
        console.error("DB Error:", err);
    } finally {
        await pool.end();
    }
}

checkShipments();
