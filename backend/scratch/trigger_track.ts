import dotenv from 'dotenv';
dotenv.config({path: '../.env-prod'});

async function run() {
  console.log("Triggering track for 700-51239322...");
  const res = await fetch("http://localhost:8000/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mawb: "700-51239322", hawb: "ISR10056834" })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run().catch(console.error);
