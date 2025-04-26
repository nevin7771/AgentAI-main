// server/service/jwt_service.js
// server/service/jwt_service.js
import jwt from "jsonwebtoken";

/**
 * Generates a JWT token for AI agent API authentication
 * @returns {Object} Object containing the token and expiry timestamp
 */
export const generateJwtToken = () => {
  try {
    // Get current time in seconds (UTC)
    const now = new Date();
    const iat = Math.floor(now.getTime() / 1000);

    // Expiry time (30 minutes from now)
    const exp = iat + 30 * 60;

    // JWT payload as specified - matching the Python script
    const payload = {
      iss: "yana.bao+AIStudio+DG01@test.zoom.us",
      aud: "zoom_caic",
      aid: "3v8eT3vkQ1-PBQnN61MJog",
      uid: "NhiGO2feQEORV5Loghzx_Q",
      iat: iat,
      exp: exp,
    };

    // Secret key - matching the Python script
    const SECRET_KEY = "gzazjvdts768lelcbcyy5ecpkiguthmq";

    // Generate the token with HS256 algorithm
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

    // Secret key - matching the Python script
    const SECRET_KEY = "gzazjvdts768lelcbcyy5ecpkiguthmq";

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

/**
 * Gets token expiration time in seconds
 * @param {string} token - JWT token
 * @returns {number|null} Expiration timestamp or null if invalid
 */
export const getTokenExpiry = (token) => {
  try {
    if (!token) return null;

    // Secret key - matching the Python script
    const SECRET_KEY = "gzazjvdts768lelcbcyy5ecpkiguthmq";

    // Decode the token
    const decoded = jwt.verify(token, SECRET_KEY, { algorithms: ["HS256"] });

    return decoded.exp;
  } catch (error) {
    console.error("Error getting token expiry:", error);
    return null;
  }
};
