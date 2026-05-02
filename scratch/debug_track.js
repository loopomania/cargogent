const fs = require('fs');
const dotenv = require('dotenv');
envConfig = dotenv.parse(fs.readFileSync('backend/.env-prod'));

async function test() {
  // Use the admin credentials to fetch the tracking data
  const res = await fetch("http://168.119.228.149/api/track/stored/01437625582/ISR10055923", {
    headers: {
      "Cookie": `cargogent_session=...` // wait, we can't easily curl this without auth. 
    }
  });
}
test();
