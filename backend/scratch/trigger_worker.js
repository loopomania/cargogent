import axios from 'axios';

async function main() {
  console.log("Triggering run-scheduled via API on cargogent.com...");
  try {
    const res = await axios.post('http://cargogent.com/api/track/run-scheduled');
    console.log("API Result:", res.data);
  } catch (e) {
    console.log("API Error:", e.response?.data || e.message);
  }
}
main();
