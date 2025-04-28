// proxy-setup.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const https = require('https');
const path = require('path');

// Create express server
const app = express();

// Path to the certificates
const CERT_PATH = path.join(__dirname, 'certs', 'fullchain.pem');
const KEY_PATH = path.join(__dirname, 'certs', 'privkey.pem');

// Check if certificates exist
if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  console.error('SSL certificates not found at:');
  console.error(`Certificate: ${CERT_PATH}`);
  console.error(`Key: ${KEY_PATH}`);
  console.error('Please place your certificates in the certs directory.');
  process.exit(1);
}

// Set up security headers
app.use((req, res, next) => {
  // HSTS header for enhanced security
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  // Other security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Configure proxy for backend API
const apiProxy = createProxyMiddleware('/api', {
  target: 'http://localhost:3030',
  changeOrigin: true,
  pathRewrite: {
    '^/api': '' // Remove /api prefix to avoid duplication
  },
  logLevel: 'debug'
});

// Configure proxy for frontend
const frontendProxy = createProxyMiddleware('/', {
  target: 'http://localhost:3000',
  changeOrigin: true,
  ws: true, // Enable WebSocket proxying
  logLevel: 'debug'
});

// Use the proxies
app.use('/api', apiProxy);
app.use('/', frontendProxy);

// Configure HTTPS server with additional options for better security
const httpsOptions = {
  cert: fs.readFileSync(CERT_PATH),
  key: fs.readFileSync(KEY_PATH),
  minVersion: 'TLSv1.2',
  ciphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES128-GCM-SHA256'
  ].join(':')
};

// Create HTTPS server
const server = https.createServer(httpsOptions, app);

// Start server
const PORT = 443;
server.listen(PORT, () => {
  console.log(`HTTPS Proxy Server running on port ${PORT}`);
  console.log('Forwarding requests to:');
  console.log('- API requests: http://localhost:3030');
  console.log('- Frontend requests: http://localhost:3000');
  console.log('Access your application at https://vista.nklab.ltd');
});
