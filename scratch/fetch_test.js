const http = require('http');

http.get('http://168.119.228.149/api/track/stored/01437625582/ISR10055923', (res) => {
  console.log(res.statusCode);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(data);
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
