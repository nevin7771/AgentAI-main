#!/bin/bash

# Start the development environment using docker-compose-local.yaml

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Docker development environment...${NC}"

# Create logs directory if it doesn't exist
mkdir -p logs

# Stop and remove any existing containers
echo -e "${YELLOW}Stopping any existing containers...${NC}"
docker-compose -f docker-compose-local.yaml down

# Build and start the containers in detached mode
echo -e "${GREEN}Building and starting containers...${NC}"
docker-compose -f docker-compose-local.yaml up --build -d

# Check if containers started successfully
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to start containers. See error messages above.${NC}"
    exit 1
fi

echo -e "${GREEN}Containers started successfully!${NC}"
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Access the application at:${NC} ${YELLOW}http://localhost:3001${NC}"
echo -e "${GREEN}Server API is available at:${NC} ${YELLOW}http://localhost:3031${NC}"
echo -e "${GREEN}MongoDB is available at:${NC} ${YELLOW}localhost:27018${NC}"
echo ""
echo -e "${GREEN}Useful commands:${NC}"
echo -e "  ${YELLOW}docker-compose -f docker-compose-local.yaml logs -f${NC}    # View logs"
echo -e "  ${YELLOW}docker-compose -f docker-compose-local.yaml down${NC}       # Stop the application"
echo -e "  ${YELLOW}docker-compose -f docker-compose-local.yaml restart${NC}    # Restart services"