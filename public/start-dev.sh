#!/bin/bash
# Script to start the React app in development mode without HTTPS

# Explicitly unset HTTPS environment variable
export HTTPS=false

# Unset SSL certificate paths
unset SSL_CRT_FILE
unset SSL_KEY_FILE

# Start React app
echo "Starting React app without HTTPS..."
npm start