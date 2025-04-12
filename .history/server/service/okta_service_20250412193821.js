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

if (!oktaDomain || !clientId || !clientSecret || !redirectUri) {
  throw new Error(
    "Missing required Okta configuration in environment variables"
  );
}

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

      // Create issuer directly instead of using discover
      const issuer = new Issuer({
        issuer: `https://${oktaDomain}/oauth2/default`,
        authorization_endpoint: `https://${oktaDomain}/oauth2/default/v1/authorize`,
        token_endpoint: `https://${oktaDomain}/oauth2/default/v1/token`,
        userinfo_endpoint: `https://${oktaDomain}/oauth2/default/v1/userinfo`,
        jwks_uri: `https://${oktaDomain}/oauth2/default/v1/keys`,
      });

      console.log("Issuer created:", issuer);

      oktaClient = new issuer.Client({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        response_types: ["code"],
      });

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
    const client = await getOktaClient();
    console.log("Getting tokens with code:", code);
    const tokenSet = await client.callback(redirectUri, { code });
    console.log("Token set received:", tokenSet);
    return tokenSet;
  } catch (error) {
    console.error("Error getting Okta tokens:", error);
    throw error;
  }
};

export const getOktaUserInfo = async (accessToken) => {
  try {
    const client = await getOktaClient();
    console.log("Getting user info with token");
    const userInfo = await client.userinfo(accessToken);
    console.log("User info received:", userInfo);
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
