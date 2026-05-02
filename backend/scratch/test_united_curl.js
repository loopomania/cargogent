import axios from 'axios';
async function main() {
  const url = 'https://www.unitedcargo.com/en/us/track/awb/016-92075841';
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0'
      }
    });
    const match = data.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!match) {
        console.log("No JSON found. Probably blocked.");
        return;
    }
    const json = JSON.parse(match[1]);
    const tracking = json.props.pageProps.api.tracking[0];
    const movements = tracking.sortedMovementList.flatMap(g => g.movements);
    console.log("Movements:");
    for (const m of movements) {
        if (m.sts_code === 'DLV') {
            console.log(m);
        }
    }
  } catch (e) {
    console.log("Error:", e.message);
  }
}
main();
