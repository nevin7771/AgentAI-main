FROM node:20.11.0

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./

RUN npm install

COPY . .

# Make port configurable via environment variable
EXPOSE 3000

# Default to production, can be overridden at runtime
ENV NODE_ENV=production

# Use start script for production, dev for development
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"production\" ]; then npm start; else npm run start; fi"]