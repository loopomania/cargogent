const http = require('http');

http.get('http://168.119.228.149/api/track/thai/21707891354', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log(res.statusCode);
    if (res.statusCode >= 300 && res.statusCode < 400) {
      console.log("Redirect:", res.headers.location);
    }
    console.log(data);
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
