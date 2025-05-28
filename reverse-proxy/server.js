const path = require("path");
const cors = require("cors");
const express = require("express");
const fileUpload = require("express-fileupload");
const https = require("https");
const fs = require("fs");
const hsts = require("hsts");
const { createProxyMiddleware } = require("http-proxy-middleware");
const helmet = require("helmet");

// Load configuration
const SERVER_CONFIG = require("./serverConfig.json");
const PORT = SERVER_CONFIG.port;
const IP = SERVER_CONFIG.listenIP;

// SSL Certificate configuration
let sslOptions;
if (SERVER_CONFIG.isProd) {
  sslOptions = {
    key: fs.readFileSync(path.resolve(__dirname, "../certs/server1.key")),
    cert: fs.readFileSync(path.resolve(__dirname, "../certs/server1.pem")),
    minVersion: "TLSv1.2",
  };
} else {
  sslOptions = {
    key: fs.readFileSync(path.resolve(__dirname, "exp-local-key.pem")),
    cert: fs.readFileSync(path.resolve(__dirname, "exp-local-cert.pem")),
    minVersion: "TLSv1.2",
  };
}

const app = express();

// Security middleware
app.use(helmet());
app.use(
  hsts({
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  })
);

// File upload middleware
app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  })
);

// CORS configuration
const corsOptions = {
  origin: [
    "https://vista.zoomdev.us",
    "https://www.vista.zoomdev.us",
    "http://localhost:3000",
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// API Proxy configuration
const apiProxy = createProxyMiddleware({
  target: "http://localhost:3030", // Changed to HTTP for local proxy
  changeOrigin: true,
  pathRewrite: { "^/api": "" },
  secure: false,
  onProxyReq: (proxyReq, req, res) => {
    console.log(`Proxying API request to: ${proxyReq.path}`);
  },
  onError: (err, req, res) => {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Proxy error" });
  },
});

// Apply proxy middleware
app.use("/api", apiProxy);
app.use("/gemini", apiProxy); // Assuming same backend for gemini routes

// Static files
app.use(
  express.static(path.resolve(__dirname, "./build"), {
    maxAge: "1y",
    setHeaders: (res, path) => {
      if (path.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  })
);

// Handle SPA routing
app.get("*", (req, res) => {
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  res.sendFile(path.resolve(__dirname, "./build", "index.html"));
});

// Create HTTPS server
const httpsServer = https.createServer(sslOptions, app);

// Server event handlers
httpsServer.on("error", (err) => {
  console.error("Server error:", err);
});

httpsServer.on("listening", () => {
  console.log(`Server running on https://${IP}:${PORT}`);
});

// Start server
httpsServer.listen(PORT, IP, () => {
  console.log(`Application available at https://${IP}:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  httpsServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
