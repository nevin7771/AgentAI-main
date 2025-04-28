# Agent API Setup

This document explains how to properly configure the Agent API integration.

## Error: 403 Forbidden

If you're seeing a 403 error like this:

```
Error submitting question to conf_ag: AxiosError: Request failed with status code 403
```

This is usually due to authentication issues. Follow these steps to resolve it:

## Configuration Steps

1. Create a `.env` file in the root directory based on the `.env.example` template.

2. Configure your agent API endpoint:
   ```
   AGENT_API_BASE_URL=https://your-agent-api-endpoint.com/api/v1
   ```

3. Set up your JWT authentication credentials:
   ```
   JWT_ISSUER=your-email@example.com
   JWT_AUDIENCE=agent_api
   JWT_AID=your-account-id
   JWT_UID=your-user-id
   JWT_SECRET_KEY=your-secret-key
   ```

4. Restart your application to apply these changes.

## Testing Your Configuration

After configuring your environment, you can test the API connection by:

1. Navigating to the Agent UI section of the application
2. Selecting an agent 
3. Submitting a test question

## API Reference

If your agent API has a different structure, you may need to modify:

- The API URL format in `server/controller/agent_api.js`
- The JWT payload structure in `server/service/jwt_service.js`
- Agent IDs in the `getAllAgents` function in `server/controller/agent_api.js`

## Debugging 403 Errors

If you continue to experience 403 errors:

1. Check your API endpoint URL
2. Verify your JWT credentials match what the API expects
3. Ensure your account has access permissions to the requested agent
4. Look for API rate limiting or IP restrictions