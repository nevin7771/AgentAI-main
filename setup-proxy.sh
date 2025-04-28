#!/bin/bash

# Setup script for SSL proxy

# Check if certificates exist
mkdir -p certs
if [ ! -f "certs/fullchain.pem" ] || [ ! -f "certs/privkey.pem" ]; then
  echo "Please place your SSL certificates in the certs directory:"
  echo "- fullchain.pem"
  echo "- privkey.pem"
  echo ""
  echo "Then run this script again."
  exit 1
fi

# Install root dependencies
npm install

# Add vista.nklab.ltd to /etc/hosts if not already there
if ! grep -q "vista.nklab.ltd" /etc/hosts; then
  echo "Adding vista.nklab.ltd to /etc/hosts"
  echo "127.0.0.1 vista.nklab.ltd" | sudo tee -a /etc/hosts
fi

# Update client .env for local development
cat > public/.env << EOF
# Server endpoints for local testing
REACT_APP_SERVER_ENDPOINT=https://vista.nklab.ltd/api
REACT_APP_API_URL=https://vista.nklab.ltd/api
REACT_APP_DOMAIN=vista.nklab.ltd

# API Keys (replace with your actual keys)
REACT_APP_Gemini_KEY=your_gemini_key
REACT_APP_OPENAI_API_KEY=your_openai_key

# Okta Configuration
REACT_APP_OKTA_CLIENT_ID=0oao97rh15qG83DJ05d7
REACT_APP_OKTA_REDIRECT_URI=http://localhost:3030/api/auth/okta/callback
REACT_APP_OKTA_ISSUER=https://dev-54126083.okta.com/oauth2/default
EOF

# Update server .env for local development
cat > server/.env << EOF
# Local SSL Configuration
HOSTNAME=vista.nklab.ltd
NODE_ENV=development

# Agent-specific configuration
API_BASE_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw

# Confluence Agent
CONF_AG_API_URL=https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=conf_ag
CONF_AG_JWT_SECRET=gzazjvdts768lelcbcyy5ecpkiguthmq
CONF_AG_JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
CONF_AG_JWT_AUDIENCE=zoom_caic
CONF_AG_JWT_AID=3v8eT3vkQ1-PBQnN61MJog
CONF_AG_JWT_UID=NhiGO2feQEORV5Loghzx_Q

# Default JWT credentials
JWT_ISSUER=yana.bao+AIStudio+DG01@test.zoom.us
JWT_AUDIENCE=zoom_caic
JWT_AID=3v8eT3vkQ1-PBQnN61MJog
JWT_UID=NhiGO2feQEORV5Loghzx_Q
JWT_SECRET_KEY=gzazjvdts768lelcbcyy5ecpkiguthmq

# CORS Configuration
CLIENT_REDIRECT_URL=https://vista.nklab.ltd

# Other configuration
PORT=3030
MONGODB_URI=mongodb://localhost:27017/agentai
EOF

echo ""
echo "Setup complete! To start the application with SSL, run:"
echo "npm run dev-ssl"
echo ""
echo "You'll need to use 'sudo' because we're running on port 443:"
echo "sudo npm run dev-ssl"
echo ""
echo "Then access your application at https://vista.nklab.ltd"