const axios = require('axios');
async function run() {
  try {
    const res = await axios.get('https://cargogent.com/api/track/01437625582?hawb=ISR10055923');
    console.log("Origin:", res.data.origin);
    console.log("Destination:", res.data.destination);
    console.log("Status:", res.data.status);
    console.log("Events:", res.data.events.length);
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
run();
