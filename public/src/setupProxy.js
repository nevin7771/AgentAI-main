const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const targetUrl = process.env.REACT_APP_PROXY_TARGET || 'https://vista.nklab.ltd';
  
  console.log(`Setting up proxy to target: ${targetUrl}`);
  
  // Proxy all API requests 
  app.use(
    '/api',
    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      secure: false, // Don't verify SSL certificates
      onProxyReq: (proxyReq, req, res) => {
        // Log request info
        console.log(`Proxying ${req.method} ${req.url} to ${targetUrl}`);
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.writeHead(500, {
          'Content-Type': 'text/plain'
        });
        res.end('Proxy error: ' + err.message);
      }
    })
  );
};