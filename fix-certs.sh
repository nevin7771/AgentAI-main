#!/bin/bash

# This script sets up proper certificate permissions and fixes SSL configuration

# Define paths
CERT_DIR="/Users/naveenkumar/Downloads/AgentAI-main/certs"
mkdir -p "$CERT_DIR"

echo "====== Certificate Setup and Trust ======"
echo "This script will help fix SSL certificate issues for vista.nklab.ltd"

# Check if we're running as root/sudo
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (use sudo)"
  exit 1
fi

# Step 1: Check if certificates exist
if [ -f "/etc/letsencrypt/live/vista.nklab.ltd/fullchain.pem" ] && [ -f "/etc/letsencrypt/live/vista.nklab.ltd/privkey.pem" ]; then
  echo "✓ Found Let's Encrypt certificates for vista.nklab.ltd"
else
  echo "✗ Let's Encrypt certificates not found. These need to be properly set up first."
  echo "  Expected paths:"
  echo "  - /etc/letsencrypt/live/vista.nklab.ltd/fullchain.pem"
  echo "  - /etc/letsencrypt/live/vista.nklab.ltd/privkey.pem"
  exit 1
fi

# Step 2: Copy certificates to the application directory with proper permissions
echo "Copying certificates to the application directory..."
cp "/etc/letsencrypt/live/vista.nklab.ltd/fullchain.pem" "$CERT_DIR/fullchain.pem"
cp "/etc/letsencrypt/live/vista.nklab.ltd/privkey.pem" "$CERT_DIR/privkey.pem"

# Fix permissions
chmod 644 "$CERT_DIR/fullchain.pem"
chmod 600 "$CERT_DIR/privkey.pem"
chown $(whoami) "$CERT_DIR/fullchain.pem" "$CERT_DIR/privkey.pem"

echo "✓ Certificates copied to $CERT_DIR with proper permissions"

# Step 3: Add domain to hosts file
if ! grep -q "vista.nklab.ltd" /etc/hosts; then
  echo "Adding vista.nklab.ltd to /etc/hosts"
  echo "127.0.0.1 vista.nklab.ltd" >> /etc/hosts
  echo "✓ Added vista.nklab.ltd to hosts file"
else
  echo "✓ Domain already in hosts file"
fi

# Step 4: Handle keychain trust (macOS specific)
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "Adding certificate to macOS keychain for trust..."
  security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CERT_DIR/fullchain.pem"
  echo "✓ Certificate added to system keychain"
fi

# Step 5: Update environment files for proper HTTPS support
echo "Updating environment configuration files..."

# Update client .env file
cat > /Users/naveenkumar/Downloads/AgentAI-main/public/.env << EOF
# Server endpoints
REACT_APP_SERVER_ENDPOINT=https://vista.nklab.ltd
REACT_APP_API_URL=https://vista.nklab.ltd
REACT_APP_DOMAIN=vista.nklab.ltd

# API Keys
REACT_APP_Gemini_KEY=your_gemini_key
REACT_APP_OPENAI_API_KEY=your_openai_key

# Okta Configuration
REACT_APP_OKTA_CLIENT_ID=0oao97rh15qG83DJ05d7
REACT_APP_OKTA_REDIRECT_URI=https://vista.nklab.ltd/api/auth/okta/callback
REACT_APP_OKTA_ISSUER=https://dev-54126083.okta.com/oauth2/default

# HTTPS configuration
HTTPS=true
SSL_CRT_FILE="$CERT_DIR/fullchain.pem"
SSL_KEY_FILE="$CERT_DIR/privkey.pem"
EOF

# Update server .env file
cat > /Users/naveenkumar/Downloads/AgentAI-main/server/.env << EOF
# SSL Configuration
HOSTNAME=vista.nklab.ltd
SSL_CERT_PATH=$CERT_DIR/fullchain.pem
SSL_KEY_PATH=$CERT_DIR/privkey.pem
HTTPS_PORT=443
NODE_ENV=production

# Agent-specific configuration
API_BASE_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/tt6w7wNWQUOn5UBPCUi2mg

# Confluence Agent
CONF_AG_API_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/tt6w7wNWQUOn5UBPCUi2mg?skillSettingId=conf_ag
CONF_AG_JWT_SECRET=xh94swe59q03xi1felkuxdntkn5gd9zt
CONF_AG_JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
CONF_AG_JWT_AUDIENCE=zoom_caic
CONF_AG_JWT_AID=3v8eT3vkQ1-PBQnN61MJog
CONF_AG_JWT_UID=NhiGO2feQEORV5Loghzx_Q

# Default JWT credentials
JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
JWT_AUDIENCE=zoom_caic
JWT_AID=3v8eT3vkQ1-PBQnN61MJog
JWT_UID=NhiGO2feQEORV5Loghzx_Q
JWT_SECRET_KEY=xh94swe59q03xi1felkuxdntkn5gd9zt

# CORS Configuration
CLIENT_REDIRECT_URL=https://vista.nklab.ltd

# Other configuration
PORT=3030
MONGODB_URI=mongodb://localhost:27017/agentai
EOF

echo "✓ Environment files updated with proper HTTPS configuration"

# Step 6: Update proxy setup
cat > /Users/naveenkumar/Downloads/AgentAI-main/proxy-setup.js << EOF
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
  console.error(\`Certificate: \${CERT_PATH}\`);
  console.error(\`Key: \${KEY_PATH}\`);
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
    '^/api': '/api'
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
  console.log(\`HTTPS Proxy Server running on port \${PORT}\`);
  console.log('Forwarding requests to:');
  console.log('- API requests: http://localhost:3030');
  console.log('- Frontend requests: http://localhost:3000');
  console.log('Access your application at https://vista.nklab.ltd');
});
EOF

echo "✓ Updated proxy setup with proper security settings"

echo ""
echo "====== CERTIFICATE SETUP COMPLETE ======"
echo ""
echo "To start the application with HTTPS:"
echo "1. First install the proxy dependencies:"
echo "   cd /Users/naveenkumar/Downloads/AgentAI-main && npm install"
echo ""
echo "2. Then run the application:"
echo "   sudo npm run dev-ssl"
echo ""
echo "3. Access your application at:"
echo "   https://vista.nklab.ltd"
echo ""
echo "HTTPS should now show as secure in your browser."