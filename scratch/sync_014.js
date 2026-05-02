const http = require('http');

const req = http.request('http://awbtrackers:8000/track/aircanada/01437625582?hawb=ISR10055923', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log(data.slice(0, 500));
  });
});
req.on('error', console.error);
req.end();
