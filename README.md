# AgentAI

An AI agent platform with support for multiple types of AI agents and interaction methods.

## Features

- Multiple agent types for different use cases
- JWT-based authentication
- OAuth integration with Okta
- MongoDB database for storing chat history and user data
- Docker support for easy deployment

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher)
- [MongoDB](https://www.mongodb.com/) (v4 or higher)
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

### Environment Setup

The application uses a centralized `.env` file in the root directory for all environment variables. Copy the example file to create your own:

```bash
cp .env.example .env
```

Edit the `.env` file to configure your environment variables:

- Database connection
- API keys
- JWT secrets
- OAuth settings
- Agent configuration

### Local Development Setup

For local development without Docker:

```bash
# Install dependencies for both the frontend and backend
npm install
cd public && npm install
cd ../server && npm install

# Start the development servers
cd ..
./start-dev.sh
```

### Docker Development Setup

For development using Docker:

```bash
# Start the containerized development environment
./docker-dev.sh
```

This will start:
- MongoDB at localhost:27018
- Backend server at http://localhost:3031
- Frontend client at http://localhost:3001

### Production Deployment

For production deployment:

```bash
# Deploy the application using Docker
docker-compose up -d
```

## File Structure

```
├── certs/                  # SSL certificates
├── logs/                   # Application logs
├── public/                 # Frontend React application
├── server/                 # Backend Node.js application
│   ├── agents/             # Agent implementation
│   ├── config/             # Server configuration
│   ├── controller/         # API controllers
│   ├── middleware/         # Custom middleware
│   ├── model/              # Database models
│   ├── router/             # API routes
│   ├── service/            # Business logic services
│   └── utils/              # Utility functions
├── .env                    # Environment variables (centralized)
├── docker-compose.yaml     # Production Docker configuration
├── docker-compose-local.yaml # Development Docker configuration
└── docker-dev.sh           # Docker development startup script
```

## License

This project is proprietary and confidential.

## Additional Documentation

- [Agent API Setup](AGENT_API_SETUP.md)
- [SSL Setup](SSL_SETUP.md)
- [Privacy Policy](PRIVACY-POLICY.md)
- [Disclaimer](DISCLAIMER.md)