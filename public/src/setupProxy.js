const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const path = require('path');

// Setup logging
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create logs directory:', err);
  }
}

const logFile = path.join(logDir, 'proxy.log');

function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  
  // Log to console
  console.log(message);
  
  // Log to file
  try {
    fs.appendFileSync(logFile, logEntry);
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

module.exports = function(app) {
  // Use local server in development mode
  const targetUrl = 'http://localhost:3030';
  
  logMessage(`Setting up proxy to target: ${targetUrl}`);
  
  // Proxy all API requests 
  app.use(
    '/api',
    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      secure: false, // Don't verify SSL certificates
      onProxyReq: (proxyReq, req, res) => {
        // Log request info
        logMessage(`Proxying ${req.method} ${req.url} to ${targetUrl}${req.url}`);
        
        // Handle POST requests with JSON bodies
        if (req.method === 'POST' && req.body) {
          const bodyData = JSON.stringify(req.body);
          logMessage(`Request body: ${bodyData.substring(0, 200)}${bodyData.length > 200 ? '...' : ''}`);
          
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          
          // Make sure we can write to the request
          if (!proxyReq.headersSent && !proxyReq.finished) {
            proxyReq.write(bodyData);
          }
        }
      },
      onProxyRes: (proxyRes, req, res) => {
        logMessage(`Proxy response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
        
        // Log response headers for debugging
        logMessage(`Response headers: ${JSON.stringify(proxyRes.headers)}`);
      },
      onError: (err, req, res) => {
        logMessage(`Proxy error for ${req.method} ${req.url}: ${err.message}`);
        logMessage(`Error details: ${JSON.stringify(err)}`);
        
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            error: 'Proxy error', 
            message: err.message,
            details: `Failed to connect to ${targetUrl}. Make sure the server is running.`
          }));
        }
      }
    })
  );
  
  // Proxy auth endpoints
  app.use(
    '/auth',
    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      secure: false,
      onError: (err, req, res) => {
        logMessage(`Auth proxy error for ${req.method} ${req.url}: ${err.message}`);
        
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            error: 'Auth proxy error', 
            message: err.message
          }));
        }
      }
    })
  );
  
  // Proxy gemini endpoints
  app.use(
    '/gemini',
    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      secure: false,
      onError: (err, req, res) => {
        logMessage(`Gemini proxy error for ${req.method} ${req.url}: ${err.message}`);
        
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            error: 'Gemini proxy error', 
            message: err.message
          }));
        }
      }
    })
  );
};