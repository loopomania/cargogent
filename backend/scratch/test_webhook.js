import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

async function run() {
    const form = new FormData();
    form.append('fromEmail', 'alon@cargogent.com');
    form.append('subject', 'test');
    form.append('file', fs.createReadStream('/Users/alonmarom/dev/cargogent/awbs/import.test.xlsx'));

    // Try prod app url first? The n8n posts to http://backend:3000/api/ingest/webhook
    // If I'm locally running, it would be http://localhost:3000/api/ingest/webhook
    // Since the user is testing prod n8n, the prod backend is https://cargogent.com/api/ingest/webhook
    
    try {
        const response = await fetch('https://cargogent.com/api/ingest/webhook', {
            method: 'POST',
            body: form
        });
        
        console.log("Status:", response.status);
        console.log(await response.text());
    } catch(e) {
        console.error(e);
    }
}
run();
