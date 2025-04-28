const { createProxyMiddleware } = require('http-proxy-middleware');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// Setup logging
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create logs directory:', err);
  }
}

const logFile = path.join(logDir, 'root-proxy.log');

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
  // Parse JSON bodies before proxying
  app.use(bodyParser.json());
  
  // Log all incoming requests for debugging
  app.use((req, res, next) => {
    logMessage(`[Request] ${req.method} ${req.url}`);
    if (req.method === 'POST' && req.body) {
      const bodyStr = JSON.stringify(req.body);
      logMessage(`[Request Body] ${bodyStr.substring(0, 200)}${bodyStr.length > 200 ? '...' : ''}`);
    }
    next();
  });
  
  // Use local server in development mode
  const targetUrl = 'http://localhost:3030';
  
  logMessage(`Setting up proxy to target: ${targetUrl}`);
  
  // Proxy API requests
  app.use(
    '/api',
    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      secure: false, // Don't verify SSL certificate
      logLevel: 'debug',
      pathRewrite: function (path, req) {
        logMessage(`Rewriting path: ${path}`);
        // Keep the path as is - no rewriting needed
        return path;
      },
      onProxyReq: function(proxyReq, req, res) {
        // Log proxy requests for debugging
        logMessage(`Proxying ${req.method} ${req.url} to ${targetUrl}${proxyReq.path}`);
        
        // If we're sending a request body, we need to read it and restream it
        if (req.body && Object.keys(req.body).length > 0) {
          const bodyStr = JSON.stringify(req.body);
          logMessage(`Request body: ${bodyStr.substring(0, 200)}${bodyStr.length > 200 ? '...' : ''}`);
          
          // Set appropriate headers
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyStr));
          
          // Write the body to the proxied request
          if (!proxyReq.finished && !proxyReq.headersSent) {
            try {
              proxyReq.write(bodyStr);
            } catch (err) {
              logMessage(`Error writing request body: ${err.message}`);
            }
          }
        }
      },
      onProxyRes: function(proxyRes, req, res) {
        // Log response status
        logMessage(`Proxy response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
        logMessage(`Response headers: ${JSON.stringify(proxyRes.headers)}`);
      },
      onError: function(err, req, res) {
        logMessage(`Proxy Error for ${req.method} ${req.url}: ${err.message}`);
        logMessage(`Error details: ${JSON.stringify(err)}`);
        
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            error: 'Proxy Error',
            message: err.message,
            details: `Failed to connect to ${targetUrl}. Make sure the server is running.`
          }));
        }
      }
    })
  );
  
  // Proxy authentication endpoints
  app.use(
    '/auth',
    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      secure: false, // Don't verify SSL certificate
      logLevel: 'debug',
      onError: function(err, req, res) {
        logMessage(`Auth Proxy Error for ${req.method} ${req.url}: ${err.message}`);
        
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            error: 'Auth Proxy Error',
            message: err.message,
            details: `Failed to connect to ${targetUrl}. Make sure the server is running.`
          }));
        }
      }
    })
  );
  
  // Proxy other gemini endpoints
  app.use(
    '/gemini',
    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      secure: false, // Don't verify SSL certificate
      logLevel: 'debug',
      onError: function(err, req, res) {
        logMessage(`Gemini Proxy Error for ${req.method} ${req.url}: ${err.message}`);
        
        if (!res.headersSent) {
          res.writeHead(500, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            error: 'Gemini Proxy Error',
            message: err.message,
            details: `Failed to connect to ${targetUrl}. Make sure the server is running.`
          }));
        }
      }
    })
  );
};