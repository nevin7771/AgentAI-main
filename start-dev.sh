#!/bin/bash

# Start development servers for AgentAI
# This script starts both the frontend and backend servers

# Set error handling
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting development environment...${NC}"

# Create log directory if it doesn't exist
mkdir -p logs

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js to continue.${NC}"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed. Please install npm to continue.${NC}"
    exit 1
fi

# Check if server dependencies are installed
if [ ! -d "server/node_modules" ]; then
    echo -e "${YELLOW}Server dependencies not found. Installing...${NC}"
    (cd server && npm install)
fi

# Check if client dependencies are installed
if [ ! -d "public/node_modules" ]; then
    echo -e "${YELLOW}Client dependencies not found. Installing...${NC}"
    (cd public && npm install)
fi

# Function to check if a port is in use
port_in_use() {
    lsof -i:$1 >/dev/null 2>&1
    return $?
}

# Check if ports are available
if port_in_use 3000; then
    echo -e "${YELLOW}Warning: Port 3000 is already in use. The frontend server might not start correctly.${NC}"
fi

if port_in_use 3030; then
    echo -e "${YELLOW}Warning: Port 3030 is already in use. The backend server might not start correctly.${NC}"
fi

# Start the backend server
echo -e "${GREEN}Starting backend server on port 3030...${NC}"
(cd server && npm run dev > ../logs/backend.log 2>&1) &
BACKEND_PID=$!

# Wait for backend to start
sleep 2

# Check if backend started successfully
if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo -e "${RED}Failed to start backend server. Check logs/backend.log for details.${NC}"
    exit 1
fi

echo -e "${GREEN}Backend server started with PID $BACKEND_PID${NC}"

# Start the frontend server
echo -e "${GREEN}Starting frontend server on port 3000...${NC}"
(cd public && npm start > ../logs/frontend.log 2>&1) &
FRONTEND_PID=$!

# Wait for frontend to start
sleep 3

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${RED}Failed to start frontend server. Check logs/frontend.log for details.${NC}"
    kill $BACKEND_PID
    exit 1
fi

echo -e "${GREEN}Frontend server started with PID $FRONTEND_PID${NC}"

# Display server information
echo -e "${GREEN}Development environment started:${NC}"
echo -e "${GREEN}Frontend: http://localhost:3000${NC}"
echo -e "${GREEN}Backend: http://localhost:3030${NC}"
echo -e "${YELLOW}Logs are being written to:${NC}"
echo -e "${YELLOW}  - Frontend: logs/frontend.log${NC}"
echo -e "${YELLOW}  - Backend: logs/backend.log${NC}"

# Handle script termination
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"
    kill $FRONTEND_PID $BACKEND_PID 2>/dev/null
    echo -e "${GREEN}All servers have been stopped.${NC}"
    exit 0
}

# Register the cleanup function for these signals
trap cleanup SIGINT SIGTERM

# Keep the script running
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"
wait