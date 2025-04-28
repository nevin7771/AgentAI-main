const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Proxy API requests to vista.nklab.ltd
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://vista.nklab.ltd',
      changeOrigin: true,
      secure: false, // Don't verify SSL certificate
      pathRewrite: {
        '^/api': '', // Remove /api prefix to avoid duplication
      },
      logLevel: 'debug'
    })
  );
  
  // Proxy authentication endpoints
  app.use(
    '/auth',
    createProxyMiddleware({
      target: 'https://vista.nklab.ltd',
      changeOrigin: true,
      secure: false, // Don't verify SSL certificate
      logLevel: 'debug'
    })
  );
  
  // Proxy other gemini endpoints
  app.use(
    '/gemini',
    createProxyMiddleware({
      target: 'https://vista.nklab.ltd',
      changeOrigin: true,
      secure: false, // Don't verify SSL certificate
      logLevel: 'debug'
    })
  );
};