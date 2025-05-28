const path = require("path");
const cors = require("cors");
const express = require("express");
const fileUpload = require("express-fileupload");
const https = require("https");
const http = require("http");
const fs = require("fs");
const helmet = require("helmet");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Security headers with CSP that allows your domain
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "https://vista.zoomdev.us",
          "https://www.vista.zoomdev.us",
          "wss://vista.zoomdev.us",
          "https://new-DAYONE.zoomdev.us",
          "https://dev-54126083.okta.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
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
    // Only allow localhost in development
    ...(process.env.NODE_ENV === "development"
      ? ["http://localhost:3000"]
      : []),
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Api-Key",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options("*", cors(corsOptions));

// Additional CORS headers middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (corsOptions.origin.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    corsOptions.allowedHeaders.join(", ")
  );
  next();
});

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${req.method} ${req.path} - Origin: ${
      req.headers.origin || "none"
    }`
  );
  next();
});

// Enhanced API Proxy configuration
const apiProxy = createProxyMiddleware({
  target: "http://localhost:3030",
  changeOrigin: true,
  secure: false,
  timeout: 30000,
  logLevel: "info",
  onProxyReq: (proxyReq, req, res) => {
    console.log(
      `[PROXY] ${req.method} ${req.path} -> http://localhost:3030${req.path}`
    );

    // Preserve original headers
    proxyReq.setHeader("X-Forwarded-For", req.ip);
    proxyReq.setHeader("X-Forwarded-Proto", req.protocol);
    proxyReq.setHeader("X-Forwarded-Host", req.get("Host"));
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`[PROXY] ${proxyRes.statusCode} ${req.method} ${req.path}`);

    // Add CORS headers to proxied responses
    const origin = req.headers.origin;
    if (corsOptions.origin.includes(origin)) {
      proxyRes.headers["Access-Control-Allow-Origin"] = origin;
      proxyRes.headers["Access-Control-Allow-Credentials"] = "true";
    }
  },
  onError: (err, req, res) => {
    console.error(`[PROXY] Error for ${req.method} ${req.path}:`, err.message);

    // Send proper error response
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: "Backend service unavailable",
        message: "The API server is not responding",
        path: req.path,
        timestamp: new Date().toISOString(),
      });
    }
  },
});

// Health check endpoint (before proxy)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "vista-proxy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Apply proxy middleware to API routes
app.use("/api", apiProxy);
app.use("/gemini", apiProxy);

// Serve static files with proper caching
app.use(
  express.static(path.resolve(__dirname, "../public/build"), {
    maxAge: "1y",
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      // Don't cache HTML files
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
      // Cache other static assets
      else {
        res.setHeader("Cache-Control", "public, max-age=31536000");
      }
    },
  })
);

// Handle React Router (SPA routing) - must be last
app.get("*", (req, res) => {
  console.log(`[STATIC] Serving index.html for: ${req.path}`);
  res.sendFile(path.resolve(__dirname, "../public/build", "index.html"));
});

// SSL Configuration
const useSSL = process.env.NODE_ENV === "production";
const certPath = "../certs/server1.pem";
const keyPath = "../certs/server1.key";

let server;

if (useSSL && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  try {
    console.log("🔒 Starting HTTPS server...");

    const sslOptions = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      minVersion: "TLSv1.2",
      ciphers: [
        "TLS_AES_256_GCM_SHA384",
        "TLS_CHACHA20_POLY1305_SHA256",
        "TLS_AES_128_GCM_SHA256",
        "ECDHE-RSA-AES128-GCM-SHA256",
        "ECDHE-ECDSA-AES128-GCM-SHA256",
      ].join(":"),
    };

    server = https.createServer(sslOptions, app);
    const HTTPS_PORT = 443;

    server.listen(HTTPS_PORT, "0.0.0.0", () => {
      console.log(
        `🚀 HTTPS Server running on https://vista.zoomdev.us:${HTTPS_PORT}`
      );
      console.log(`📱 Application available at https://vista.zoomdev.us`);
      console.log(`🔗 Backend proxy target: http://localhost:3030`);
    });

    // Create HTTP to HTTPS redirect server
    const httpApp = express();
    httpApp.use((req, res) => {
      const redirectUrl = `https://${req.headers.host}${req.url}`;
      console.log(`[REDIRECT] ${req.url} -> ${redirectUrl}`);
      res.redirect(301, redirectUrl);
    });

    http.createServer(httpApp).listen(80, "0.0.0.0", () => {
      console.log("🔄 HTTP to HTTPS redirect server running on port 80");
    });
  } catch (err) {
    console.error("❌ SSL Error:", err.message);
    console.log("🔄 Falling back to HTTP server");
    startHttpServer();
  }
} else {
  if (useSSL) {
    console.log("⚠️  SSL certificates not found, falling back to HTTP");
    console.log(`Expected cert: ${certPath}`);
    console.log(`Expected key: ${keyPath}`);
  }
  startHttpServer();
}

function startHttpServer() {
  server = http.createServer(app);
  const PORT = process.env.PORT || 3000;

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 HTTP Server running on http://0.0.0.0:${PORT}`);
    console.log(`🔗 Backend proxy target: http://localhost:3030`);

    if (process.env.NODE_ENV === "production") {
      console.log("⚠️  Running in production mode without HTTPS!");
    }
  });
}

// Enhanced error handling
server?.on("error", (err) => {
  console.error("❌ Server error:", err);
  if (err.code === "EADDRINUSE") {
    console.error(
      "❌ Port is already in use. Please stop other services first."
    );
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);

  if (server) {
    server.close(() => {
      console.log("✅ Server closed successfully");
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.log("⚠️  Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
});

console.log("🎯 Vista Proxy Server initialized");
console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`🔒 SSL Mode: ${useSSL ? "enabled" : "disabled"}`);
