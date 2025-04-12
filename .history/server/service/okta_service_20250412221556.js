// In okta_service.js
import "dotenv/config";
import jwt from "jsonwebtoken";
import OktaJwtVerifier from "@okta/jwt-verifier";
import * as client from "openid-client";

// Debug logging for environment variables
console.log("Environment Variables:");
console.log("OKTA_DOMAIN:", process.env.OKTA_DOMAIN);
console.log("OKTA_CLIENT_ID:", process.env.OKTA_CLIENT_ID);
console.log(
  "OKTA_CLIENT_SECRET:",
  process.env.OKTA_CLIENT_SECRET ? "***" : "undefined"
);
console.log("OKTA_REDIRECT_URI:", process.env.OKTA_REDIRECT_URI);

const oktaDomain = process.env.OKTA_DOMAIN;
const clientId = process.env.OKTA_CLIENT_ID;
const clientSecret = process.env.OKTA_CLIENT_SECRET;
const redirectUri = process.env.OKTA_REDIRECT_URI;

// JWT Verifier for validating Okta tokens
const oktaJwtVerifier = new OktaJwtVerifier({
  issuer: `https://${oktaDomain}/oauth2/default`,
  clientId: clientId,
});

let oktaClient;

export const getOktaClient = async () => {
  try {
    if (!oktaClient) {
      console.log("Initializing Okta client...");

      // Use the discovery method from the documentation
      const config = await client.discovery(
        new URL(`https://${oktaDomain}/oauth2/default`),
        clientId,
        clientSecret
      );

      console.log("Okta configuration discovered");

      // The library now handles client creation internally
      oktaClient = config;

      console.log("Okta client created successfully");
    }
    return oktaClient;
  } catch (error) {
    console.error("Error creating Okta client:", error);
    console.error("Error details:", {
      oktaDomain,
      clientId,
      redirectUri,
      errorMessage: error.message,
      errorStack: error.stack,
    });
    throw error;
  }
};

export const getOktaTokens = async (code) => {
  try {
    const config = await getOktaClient();
    console.log("Getting tokens with code:", code);

    // Use the authorizationCodeGrant function from the library
    const tokens = await client.authorizationCodeGrant(
      config,
      new URL(`${redirectUri}?code=${code}`),
      {}
    );

    console.log("Token set received");
    return tokens;
  } catch (error) {
    console.error("Error getting Okta tokens:", error);
    throw error;
  }
};

export const getOktaUserInfo = async (accessToken) => {
  try {
    console.log("Getting user info with token");

    // Use fetchProtectedResource to get user info
    const userInfoResponse = await client.fetchProtectedResource(
      await getOktaClient(),
      accessToken,
      new URL(`https://${oktaDomain}/oauth2/default/v1/userinfo`),
      "GET"
    );

    const userInfo = await userInfoResponse.json();
    console.log("User info received");
    return userInfo;
  } catch (error) {
    console.error("Error getting Okta user info:", error);
    throw error;
  }
};

export const verifyOktaToken = async (token) => {
  try {
    return await oktaJwtVerifier.verifyAccessToken(token);
  } catch (error) {
    console.error("Error verifying Okta token:", error);
    throw error;
  }
};

export const jwtSignIn = (userData, secret, expireTime) => {
  return jwt.sign(userData, secret, { expiresIn: expireTime });
};
