// Updated server/app.js with Day One API routes
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import requestIp from "request-ip";
import cors from "cors";
import fs from "fs";
import https from "https";
import http from "http";
import publicRoutes from "./router/public.js";
import authRoutes from "./router/auth.js";
import agentRouter from "./router/agent.js";
import dayoneTokenApiRouter from "./router/dayone_token_api.js";
import jiraAgentRouter from "./router/jira_agent.js";
import { initializeToken } from "./utils/tokenInitializer.js";

// Verify environment variables are loaded
console.log("Environment check:");
console.log("OKTA_DOMAIN:", process.env.OKTA_DOMAIN ? "***" : "undefined");
console.log(
  "OKTA_CLIENT_ID:",
  process.env.OKTA_CLIENT_ID ? "***" : "undefined"
);
console.log("OKTA_REDIRECT_URI:", process.env.OKTA_REDIRECT_URI);
console.log(
  "OPENAI_API_KEY:",
  process.env.OPENAI_API_KEY ? "***" : "undefined"
);
console.log(
  "DAYONE_JWT_TOKEN:",
  process.env.DAYONE_JWT_TOKEN ? "***" : "undefined"
);

const MONGODB_URL =
  process.env.MONGODB_URL || `mongodb://localhost:27017/gemini`;
const PORT_NO = 3030;

const app = express();

// JSON body parser configuration
app.use(
  express.json({
    limit: "10mb", // Increase JSON payload limit for large agent responses
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Add the URL-encoded parser for form submissions
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

app.use(requestIp.mw());

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === "POST" && req.body) {
    console.log(
      "Request body:",
      JSON.stringify(req.body).substring(0, 200) +
        (JSON.stringify(req.body).length > 200 ? "..." : "")
    );
  }
  next();
});

const originUrl = process.env.CLIENT_REDIRECT_URL;
const hostname = process.env.HOSTNAME || "vista.nklab.ltd";

// Configure CORS options
const corsOption = {
  origin: [
    originUrl || `https://${hostname}`,
    originUrl || `https://www.${hostname}`,
    "https://localhost:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  optionsSuccessStatus: 200,
  credentials: true, // Essential for cookies
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allow specific methods
  allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key"], // Allow specific headers
};

app.use(cors(corsOption));

// Add OPTIONS handling for preflight requests
app.options("*", cors(corsOption));

// Add a middleware to ensure Access-Control-Allow-Origin header is set
app.use((req, res, next) => {
  // Get the origin from the request
  const origin = req.headers.origin;

  // Check if origin is in our allowed origins
  const allowedOrigins = [
    originUrl || `https://${hostname}`,
    originUrl || `https://www.${hostname}`,
    "https://localhost:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  // If the origin is allowed, set it in the response header
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // Continue to the next middleware
  next();
});

// Add simple health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/", publicRoutes); // Mount at root for /api/* routes
app.use("/gemini", publicRoutes); // Mount at /gemini for backward compatibility
app.use(authRoutes);
app.use(agentRouter); // Add the agent router which includes deep-research endpoint
app.use(dayoneTokenApiRouter);
app.use(jiraAgentRouter);
// 404 handler
app.use((req, res, next) => {
  console.log(`404 Not Found: ${req.method} ${req.path}`);
  res.status(404).json({ message: `Not Found: ${req.method} ${req.path}` });
});

// Error handler
app.use((error, req, res, next) => {
  console.error(`Error in ${req.method} ${req.path}:`, error);
  const status = error.statusCode || 500;
  const message = error.message || "Internal Server Error";
  const data = error.data;

  res
    .status(status)
    .json({ message: message, data: data, error: error.toString() });
});

// SSL certificate paths
const SSL_CERT_PATH =
  process.env.SSL_CERT_PATH ||
  "/etc/letsencrypt/live/vista.nklab.ltd/fullchain.pem";
const SSL_KEY_PATH =
  process.env.SSL_KEY_PATH ||
  "/etc/letsencrypt/live/vista.nklab.ltd/privkey.pem";

// Connect to MongoDB and start the server(s)
mongoose
  .connect(MONGODB_URL)
  .then(async () => {
    try {
      // Initialize LLM Gateway token and Day One token before starting server
      await initializeToken();
      console.log("Token initialization complete");
    } catch (error) {
      console.warn(
        "Token initialization failed, but continuing server startup:",
        error.message
      );
    }
    // For development or if certificates don't exist, use HTTP server
    if (
      process.env.NODE_ENV !== "production" ||
      !fs.existsSync(SSL_CERT_PATH) ||
      !fs.existsSync(SSL_KEY_PATH)
    ) {
      const httpServer = http.createServer(app);
      httpServer.listen(process.env.PORT || PORT_NO, () => {
        console.log(
          `HTTP server is running on port ${process.env.PORT || PORT_NO}`
        );
        console.log(
          `Server URL: http://localhost:${process.env.PORT || PORT_NO}`
        );
        console.log("Available endpoints:");
        console.log("- GET  /api/health");
        console.log("- GET  /api/available-agents");
        console.log("- POST /api/generate-jwt");
        console.log("- POST /api/agent-question");
        console.log("- GET  /api/agent-response/:taskId");
        console.log("- POST /api/dayone/confluence (streaming)");
        console.log("- POST /api/dayone/monitor (streaming)");
      });
      return; // Skip HTTPS setup in development mode
    }

    // For production with valid certificates, try to use HTTPS
    try {
      // Only attempt to read SSL certificates if they exist
      if (fs.existsSync(SSL_CERT_PATH) && fs.existsSync(SSL_KEY_PATH)) {
        const httpsOptions = {
          cert: fs.readFileSync(SSL_CERT_PATH),
          key: fs.readFileSync(SSL_KEY_PATH),
          minVersion: "TLSv1.2",
          ciphers: [
            "TLS_AES_256_GCM_SHA384",
            "TLS_CHACHA20_POLY1305_SHA256",
            "TLS_AES_128_GCM_SHA256",
            "ECDHE-RSA-AES128-GCM-SHA256",
            "ECDHE-ECDSA-AES128-GCM-SHA256",
          ].join(":"),
        };

        const httpsServer = https.createServer(httpsOptions, app);
        const httpsPort = process.env.HTTPS_PORT || 3443;

        httpsServer.listen(httpsPort, () => {
          console.log(`HTTPS server is running on port ${httpsPort}`);
          console.log(`Secure server URL: https://${hostname}:${httpsPort}`);
          console.log(`Domain: ${hostname}`);
          console.log("Available endpoints:");
          console.log("- GET  /api/health");
          console.log("- GET  /api/available-agents");
          console.log("- POST /api/generate-jwt");
          console.log("- POST /api/agent-question");
          console.log("- GET  /api/agent-response/:taskId");
          console.log("- POST /api/dayone/confluence (streaming)");
          console.log("- POST /api/dayone/monitor (streaming)");
        });
      } else {
        console.warn("SSL certificates not found. HTTPS server not started.");
        console.warn(`Expected cert path: ${SSL_CERT_PATH}`);
        console.warn(`Expected key path: ${SSL_KEY_PATH}`);

        // Start HTTP server as fallback
        const httpServer = http.createServer(app);
        httpServer.listen(process.env.PORT || PORT_NO, () => {
          console.log(
            `HTTP server is running on port ${process.env.PORT || PORT_NO}`
          );
          console.log(
            `Server URL: http://localhost:${process.env.PORT || PORT_NO}`
          );
        });
      }
    } catch (err) {
      console.error("Error starting HTTPS server:", err);

      // Start HTTP server as fallback if HTTPS fails
      const httpServer = http.createServer(app);
      httpServer.listen(process.env.PORT || PORT_NO, () => {
        console.log(
          `HTTP server (fallback) is running on port ${
            process.env.PORT || PORT_NO
          }`
        );
        console.log(
          `Server URL: http://localhost:${process.env.PORT || PORT_NO}`
        );
      });
    }
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
