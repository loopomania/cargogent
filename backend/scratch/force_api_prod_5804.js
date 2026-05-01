import axios from 'axios';

async function main() {
  console.log("Triggering live sync via API on cargogent.com...");
  try {
    const res = await axios.post('http://cargogent.com/api/track', {
      mawb: '016-92075804',
      hawb: 'ISR10055888',
      tenantId: '8998b6c6-85b4-4be5-af58-49c6bdc28890',
      domainName: 'loopomania.com'
    });
    console.log("API Result:", res.data);
  } catch (e) {
    console.log("API Error:", e.response?.data || e.message);
  }
}
main();
