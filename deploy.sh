#!/bin/bash

# Deploy script for AgentAI with HTTPS support for vista.nklab.ltd

echo "Starting AgentAI deployment"

# Ensure we are in the right directory
cd "$(dirname "$0")"
PROJECT_ROOT=$(pwd)

echo "Project root: $PROJECT_ROOT"

# Check if the SSL certificates exist
if [ ! -f "/etc/letsencrypt/live/vista.nklab.ltd/fullchain.pem" ] || [ ! -f "/etc/letsencrypt/live/vista.nklab.ltd/privkey.pem" ]; then
    echo "Error: SSL certificates not found at /etc/letsencrypt/live/vista.nklab.ltd/"
    echo "Please ensure the certificates are properly set up first."
    exit 1
fi

# Create systemd service file
echo "Setting up systemd service..."
sudo cp $PROJECT_ROOT/agentai.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable agentai.service

# Install dependencies for server
echo "Installing server dependencies..."
cd $PROJECT_ROOT/server
npm install

# Install dependencies for client
echo "Installing client dependencies..."
cd $PROJECT_ROOT/public
npm install

# Ensure permission to read SSL certificates
echo "Setting SSL certificate permissions..."
sudo setfacl -m u:node:rx /etc/letsencrypt/live
sudo setfacl -m u:node:rx /etc/letsencrypt/archive
sudo setfacl -m u:node:r /etc/letsencrypt/live/vista.nklab.ltd/fullchain.pem
sudo setfacl -m u:node:r /etc/letsencrypt/live/vista.nklab.ltd/privkey.pem

# Start the service
echo "Starting AgentAI service..."
sudo systemctl start agentai.service
sudo systemctl status agentai.service

echo "Deployment complete. Service should be running at https://vista.nklab.ltd:3443"
echo "To check logs, use: sudo journalctl -u agentai.service -f"