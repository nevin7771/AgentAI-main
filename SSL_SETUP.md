# SSL Configuration for AgentAI

This document explains how to properly set up SSL certificates for the AgentAI application on `vista.nklab.ltd`.

## Certificate Details

The SSL certificates are stored at:
- Certificate: `/etc/letsencrypt/live/vista.nklab.ltd/fullchain.pem`
- Private Key: `/etc/letsencrypt/live/vista.nklab.ltd/privkey.pem`

## HTTPS Server Configuration

The application has been configured to run an HTTPS server on port 3443 using these certificates. The configuration is in `server/app.js`.

## Deployment

To deploy the application with HTTPS support:

1. Make sure the SSL certificates are properly installed at the paths above.

2. Run the deployment script:
   ```
   chmod +x deploy.sh
   sudo ./deploy.sh
   ```

This will:
- Set up the systemd service
- Install dependencies
- Configure proper permissions for the SSL certificates
- Start the service

## Manual Setup

If you prefer to set up manually:

1. Install dependencies:
   ```
   cd server && npm install
   cd ../public && npm install
   ```

2. Configure environment variables:
   - Copy `.env.example` to `.env` in both `server/` and `public/` directories
   - Update with your specific settings

3. Set certificate permissions:
   ```
   sudo setfacl -m u:<your-user>:rx /etc/letsencrypt/live
   sudo setfacl -m u:<your-user>:rx /etc/letsencrypt/archive
   sudo setfacl -m u:<your-user>:r /etc/letsencrypt/live/vista.nklab.ltd/fullchain.pem
   sudo setfacl -m u:<your-user>:r /etc/letsencrypt/live/vista.nklab.ltd/privkey.pem
   ```

4. Start the server:
   ```
   cd server
   node app.js
   ```

## CORS Configuration

CORS has been configured in the server to allow requests from:
- `https://vista.nklab.ltd`
- `https://www.vista.nklab.ltd`
- `https://localhost:3000` (for development)

If you need to add additional domains, update the `corsOption` in `server/app.js`.

## Troubleshooting

If you encounter CORS errors:
1. Check that your client is making requests to the correct URL (`https://vista.nklab.ltd:3443`)
2. Ensure your CORS configuration includes all necessary domains
3. Verify that your SSL certificates are valid and properly configured

For certificate permission issues:
```
sudo chown -R :nodejs /etc/letsencrypt/live/vista.nklab.ltd/
sudo chown -R :nodejs /etc/letsencrypt/archive/vista.nklab.ltd/
sudo chmod -R 750 /etc/letsencrypt/live/vista.nklab.ltd/
sudo chmod -R 750 /etc/letsencrypt/archive/vista.nklab.ltd/
```