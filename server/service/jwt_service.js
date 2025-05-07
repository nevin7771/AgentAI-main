// server/service/jwt_service.js
import jwt from "jsonwebtoken";

/**
 * Generates an agent-specific JWT token
 * @param {string} agentId - ID of the agent
 * @param {string} secretKey - Secret key for the agent
 * @param {number} expiryMinutes - Token expiry in minutes (default: 30)
 * @returns {string} JWT token for the specific agent
 */
export const generateAgentToken = (agentId, secretKey, expiryMinutes = 30) => {
  try {
    // Get current time in seconds (UTC)
    const now = Math.floor(Date.now() / 1000);

    // Expiry time (specified minutes from now) - ensure it's not too long
    // AI Studio has a max token lifetime requirement
    const maxExpiryMinutes = 50; // Maximum allowed by AI Studio
    const adjustedExpiry = Math.min(expiryMinutes, maxExpiryMinutes);
    const exp = now + adjustedExpiry * 60;

    // Get agent-specific configuration from environment variables
    const issuer =
      process.env[`${agentId.toUpperCase()}_JWT_ISSUER`] ||
      process.env.JWT_ISSUER ||
      "yana.bao+AIStudio+DG01@test.zoom.us";

    const audience =
      process.env[`${agentId.toUpperCase()}_JWT_AUDIENCE`] ||
      process.env.JWT_AUDIENCE ||
      "zoom_caic";

    const aid =
      process.env[`${agentId.toUpperCase()}_JWT_AID`] ||
      process.env.JWT_AID ||
      "3v8eT3vkQ1-PBQnN61MJog";

    const uid =
      process.env[`${agentId.toUpperCase()}_JWT_UID`] ||
      process.env.JWT_UID ||
      "NhiGO2feQEORV5Loghzx_Q";

    // Payload with agent-specific values
    const payload = {
      iss: issuer,
      aud: audience,
      aid: aid,
      uid: uid,
      iat: now,
      exp: exp,
    };

    // Make sure we have a valid secret key, otherwise use default
    if (!secretKey) {
      console.warn(
        `No secret key provided for agent ${agentId}, using default JWT_SECRET_KEY`
      );
      secretKey =
        process.env.JWT_SECRET_KEY || "xh94swe59q03xi1felkuxdntkn5gd9zt";
    }

    console.log(`Generating token for agent ${agentId} with payload:`, payload);
    console.log(`Using secret key: ${secretKey.substring(0, 5)}...`);

    // Generate the token using HS256 algorithm
    const token = jwt.sign(payload, secretKey, { algorithm: "HS256" });
    console.log(`Generated token: ${token.substring(0, 20)}...`);

    return token;
  } catch (error) {
    console.error(`Error generating JWT token for agent ${agentId}:`, error);
    throw error;
  }
};

/**
 * Generates a JWT token for AI agent API authentication
 * Uses the standard format expected by agent APIs
 * @returns {Object} Object containing the token and expiry timestamp
 */
export const generateJwtToken = () => {
  try {
    // Get current time in seconds (UTC)
    const now = Math.floor(Date.now() / 1000);

    // Expiry time (30 minutes from now)
    const exp = now + 30 * 60;

    // Standard JWT payload format expected by the agent API
    const payload = {
      // These values should be configured via environment variables
      iss: process.env.JWT_ISSUER || "yana.bao+AIStudio+DG01@test.zoom.us",
      aud: process.env.JWT_AUDIENCE || "zoom_caic",
      aid: process.env.JWT_AID || "3v8eT3vkQ1-PBQnN61MJog",
      uid: process.env.JWT_UID || "NhiGO2feQEORV5Loghzx_Q",
      iat: now,
      exp: exp,
    };

    // The secret key used for signing the token
    const SECRET_KEY =
      process.env.JWT_SECRET_KEY || "xh94swe59q03xi1felkuxdntkn5gd9zt";

    // Generate the token using HS256 algorithm
    const token = jwt.sign(payload, SECRET_KEY, { algorithm: "HS256" });

    return {
      token,
      expiresAt: exp,
    };
  } catch (error) {
    console.error("Error generating JWT token:", error);
    throw error;
  }
};

/**
 * Checks if a token is valid and not expired
 * @param {string} token - JWT token to verify
 * @returns {boolean} Whether the token is valid
 */
export const verifyToken = (token) => {
  try {
    if (!token) return false;

    // Secret key for verification
    const SECRET_KEY =
      process.env.JWT_SECRET_KEY || "xh94swe59q03xi1felkuxdntkn5gd9zt";

    // Verify the token
    const decoded = jwt.verify(token, SECRET_KEY, { algorithms: ["HS256"] });

    // Check if token is expired
    const currentTime = Math.floor(Date.now() / 1000);
    if (decoded.exp < currentTime) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error verifying token:", error);
    return false;
  }
};
