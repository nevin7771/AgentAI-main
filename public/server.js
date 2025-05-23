//Rename this file to index.js
//Update your routes, certificates

const path = require("path");
const cors = require("cors");
const express = require("express");
const fileUpload = require("express-fileupload");
const bodyParser = require("body-parser");
const https = require("https");
var fs = require("fs");
var hsts = require("hsts");

var SERVER_CONFIG = require("./serverConfig.json");

const PORT = SERVER_CONFIG.port;
const IP = SERVER_CONFIG.listenIP;

if (SERVER_CONFIG.isProd) {
  var key = "../certs/server1.key"; //prod cert key
  var cert = "../certs/server1.pem"; //prod cert
} else {
  var key = "exp-local-key.pem"; //for local cert key
  var cert = "exp-local-cert.pem"; //for local cert
}

const app = express();
//app.use(helmet())

app.use(
  hsts({
    maxAge: 31536000,
    includeSubDomains: true, // Also enabled by default
  })
);

app.use(
  fileUpload({
    createParentPath: true,
  })
);

app.use(cors()); //Need this for CORS to work fine
app.options("*", cors()); //Need this for CORS to work fine. * so that we accept eveything. We can restrict if required.
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const httpsServer = https.createServer(
  {
    key: fs.readFileSync(key),
    cert: fs.readFileSync(cert),
  },
  app
);

var proxy = require("http-proxy").createProxyServer({
  host: "https://vista.zoomdev.us",
  port: 3000,
});

//Routes for YOUR APP Begin
//This route is to act as a proxy between your front end and backend. Ex : Browser => Experss => Pythong/Golang
//We used this so that backend is safe, and cannot be accessed directly by browser. Otherwise we have to open that port as well.

app.use("/api", function (req, res, next) {
  console.log("statusCode:", req, res, next);
  proxy.web(
    req,
    res,
    {
      target: "https://vista.zoomdev.us:3030",
    },
    next
  );
});

app.listen(8001, function () {
  console.log("Listening!");
});

var server = httpsServer.listen(PORT, IP);
server.on("connection", function (socket) {
  console.log("A new connection was made by a client.");
  socket.setTimeout(900 * 1000);
  // 900 second timeout. Change this as you see fit.
});

app.use(express.static(path.resolve(__dirname, "./build")));
app.get("*", (req, res) => {
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  res.sendFile(path.resolve(__dirname, "./build", "index.html"));
});
