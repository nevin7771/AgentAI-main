#!/bin/bash

# Deploy script for AgentAI on macOS

echo "Starting AgentAI macOS deployment"

# Ensure we are in the right directory
cd "$(dirname "$0")"
PROJECT_ROOT=$(pwd)

echo "Project root: $PROJECT_ROOT"

# Check if the certificates directory exists
CERT_DIR="$PROJECT_ROOT/certs"
mkdir -p "$CERT_DIR"

# Create self-signed certificates for local testing if they don't exist
if [ ! -f "$CERT_DIR/server.key" ] || [ ! -f "$CERT_DIR/server.crt" ]; then
  echo "Creating self-signed certificates for local testing..."
  
  # Create openssl config file
  cat > $CERT_DIR/openssl.cnf << EOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = vista.nklab.ltd

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = vista.nklab.ltd
DNS.2 = localhost
EOF

  # Create a self-signed certificate
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout $CERT_DIR/server.key \
    -out $CERT_DIR/server.crt \
    -config $CERT_DIR/openssl.cnf
  
  echo "Self-signed certificates created at $CERT_DIR"
  
  # Add a local entry to /etc/hosts if it doesn't exist
  if ! grep -q "vista.nklab.ltd" /etc/hosts; then
    echo "Adding vista.nklab.ltd to /etc/hosts"
    echo "127.0.0.1 vista.nklab.ltd" | sudo tee -a /etc/hosts
  fi
fi

# Create .env file for server with local certificate paths
cat > $PROJECT_ROOT/server/.env << EOF
# Local SSL Configuration
HOSTNAME=vista.nklab.ltd
SSL_CERT_PATH=$CERT_DIR/server.crt
SSL_KEY_PATH=$CERT_DIR/server.key
HTTPS_PORT=3443
NODE_ENV=development

# Agent-specific configuration
# For each agent, configure its own URL and JWT credentials
API_BASE_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw

# Confluence Agent
CONF_AG_API_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=conf_ag
CONF_AG_JWT_SECRET=gzazjvdts768lelcbcyy5ecpkiguthmq
CONF_AG_JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
CONF_AG_JWT_AUDIENCE=zoom_caic
CONF_AG_JWT_AID=3v8eT3vkQ1-PBQnN61MJog
CONF_AG_JWT_UID=NhiGO2feQEORV5Loghzx_Q

# Jira Agent
JIRA_AG_API_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=jira_ag
JIRA_AG_JWT_SECRET=gzazjvdts768lelcbcyy5ecpkiguthmq
JIRA_AG_JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
JIRA_AG_JWT_AUDIENCE=zoom_caic
JIRA_AG_JWT_AID=3v8eT3vkQ1-PBQnN61MJog
JIRA_AG_JWT_UID=NhiGO2feQEORV5Loghzx_Q

# Client Agent
CLIENT_AGENT_API_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=client_agent
CLIENT_AGENT_JWT_SECRET=gzazjvdts768lelcbcyy5ecpkiguthmq
CLIENT_AGENT_JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
CLIENT_AGENT_JWT_AUDIENCE=zoom_caic
CLIENT_AGENT_JWT_AID=3v8eT3vkQ1-PBQnN61MJog
CLIENT_AGENT_JWT_UID=NhiGO2feQEORV5Loghzx_Q

# ZR Agent
ZR_AG_API_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=zr_ag
ZR_AG_JWT_SECRET=gzazjvdts768lelcbcyy5ecpkiguthmq
ZR_AG_JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
ZR_AG_JWT_AUDIENCE=zoom_caic
ZR_AG_JWT_AID=3v8eT3vkQ1-PBQnN61MJog
ZR_AG_JWT_UID=NhiGO2feQEORV5Loghzx_Q

# ZP Agent
ZP_AG_API_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=zp_ag
ZP_AG_JWT_SECRET=gzazjvdts768lelcbcyy5ecpkiguthmq
ZP_AG_JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
ZP_AG_JWT_AUDIENCE=zoom_caic
ZP_AG_JWT_AID=3v8eT3vkQ1-PBQnN61MJog
ZP_AG_JWT_UID=NhiGO2feQEORV5Loghzx_Q

# Default JWT credentials
JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
JWT_AUDIENCE=zoom_caic
JWT_AID=3v8eT3vkQ1-PBQnN61MJog
JWT_UID=NhiGO2feQEORV5Loghzx_Q
JWT_SECRET_KEY=gzazjvdts768lelcbcyy5ecpkiguthmq

# CORS Configuration
CLIENT_REDIRECT_URL=https://vista.nklab.ltd:3000

# Other configuration
PORT=3030
MONGODB_URI=mongodb://localhost:27017/agentai
EOF

# Create .env file for client
cat > $PROJECT_ROOT/public/.env << EOF
# Server endpoints for local testing
REACT_APP_SERVER_ENDPOINT=https://vista.nklab.ltd:3443
REACT_APP_API_URL=https://vista.nklab.ltd:3443
REACT_APP_DOMAIN=vista.nklab.ltd

# API Keys (replace with your actual keys)
REACT_APP_Gemini_KEY=your_gemini_key
REACT_APP_OPENAI_API_KEY=your_openai_key

# Okta Configuration
REACT_APP_OKTA_CLIENT_ID=0oao97rh15qG83DJ05d7
REACT_APP_OKTA_REDIRECT_URI=http://localhost:3030/api/auth/okta/callback
REACT_APP_OKTA_ISSUER=https://dev-54126083.okta.com/oauth2/default
EOF

# Install dependencies for server
echo "Installing server dependencies..."
cd $PROJECT_ROOT/server
npm install

# Install dependencies for client
echo "Installing client dependencies..."
cd $PROJECT_ROOT/public
npm install

# Start the processes
echo "Starting the application..."
cd $PROJECT_ROOT
osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_ROOT/server' && node app.js"
end tell
tell application "Terminal"
    do script "cd '$PROJECT_ROOT/public' && npm start"
end tell
EOF

echo "Deployment complete! The application should be running at:"
echo "- Server: https://vista.nklab.ltd:3443"
echo "- Client: https://vista.nklab.ltd:3000"
echo ""
echo "NOTE: You may need to trust the self-signed certificate in your browser."
echo "Visit https://vista.nklab.ltd:3443/api/health in your browser and follow the prompts to trust the certificate."