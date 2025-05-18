// server/utils/tokenInitializer.js
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";

const execAsync = promisify(exec);
const isProduction = process.env.NODE_ENV === "production";

// Load environment variables
dotenv.config();

/**
 * Initialize the LLM Gateway token
 * This runs during server startup to ensure a valid token is available
 */
export async function initializeToken() {
  console.log("[TokenInitializer] Starting token initialization...");

  try {
    // Check if token exists and is valid
    if (await isTokenValid()) {
      console.log("[TokenInitializer] Existing token is valid. Using it.");
      return true;
    }

    // Token doesn't exist or is invalid - generate a new one
    console.log(
      "[TokenInitializer] Token missing or invalid. Generating new token..."
    );

    if (isProduction) {
      // In production (EC2), use instance profile
      await generateTokenWithInstanceProfile();
    } else {
      // In development, use AWS CLI
      await generateTokenWithAwsCli();
    }

    // Reload environment variables after token update
    dotenv.config();

    return true;
  } catch (error) {
    console.error("[TokenInitializer] Error initializing token:", error);
    // Don't fail server startup - just log the error
    // The server can still run, and requests that need the token will fail individually
    return false;
  }
}

/**
 * Check if the current token is valid
 */
async function isTokenValid() {
  // Simple check: token exists and env file was modified less than 6 days ago
  const token = process.env.LLM_GATEWAY_JWT_TOKEN;

  if (!token) {
    console.log("[TokenInitializer] No token found in environment variables");
    return false;
  }

  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const stats = fs.statSync(envPath);
    const fileModTime = stats.mtime;
    const currentTime = new Date();

    // Calculate days since last update
    const daysSinceUpdate = (currentTime - fileModTime) / (1000 * 60 * 60 * 24);

    // Token is valid if less than 6 days old (tokens last 7 days)
    const isValid = daysSinceUpdate < 6;

    console.log(
      `[TokenInitializer] Token is ${daysSinceUpdate.toFixed(
        1
      )} days old. Valid: ${isValid}`
    );

    return isValid;
  } catch (error) {
    console.error("[TokenInitializer] Error checking token validity:", error);
    return false;
  }
}

/**
 * Generate token using EC2 instance profile (for production)
 */
async function generateTokenWithInstanceProfile() {
  console.log(
    "[TokenInitializer] Generating token using EC2 instance profile..."
  );

  try {
    // For EC2 instances with instance profile, no need to get credentials
    // The AWS SDK will use the instance profile automatically
    // Just run the token generation script
    const { stdout, stderr } = await execAsync(
      "python generate_token.py -audience=llm-gateway -csms_prefix=dev/dev-jira"
    );

    if (stderr) {
      console.warn("[TokenInitializer] Warning from token generation:", stderr);
    }

    // Extract token from output
    const lines = stdout.split("\n");
    const tokenLine = lines.find(
      (line) => !line.includes("JWT TOKEN Expire") && line.trim().length > 0
    );

    if (!tokenLine) {
      throw new Error("Could not find token in script output");
    }

    const token = tokenLine.trim();

    // Update .env file with the new token
    await updateEnvFile(token);

    console.log(
      "[TokenInitializer] Successfully generated and saved token using instance profile"
    );
    return true;
  } catch (error) {
    console.error(
      "[TokenInitializer] Error generating token with instance profile:",
      error
    );
    throw error;
  }
}

/**
 * Generate token using AWS CLI (for development)
 */
async function generateTokenWithAwsCli() {
  console.log("[TokenInitializer] Generating token using AWS CLI...");

  try {
    // Step 1: Run AWS SSO login (non-interactive for development)
    console.log("[TokenInitializer] Running AWS SSO login...");

    // Check if credentials are already available and valid
    let needsLogin = true;

    try {
      // Check if aws credentials file exists and is valid
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      const credPath = path.join(homeDir, ".aws", "credentials");

      if (fs.existsSync(credPath)) {
        const credsContent = fs.readFileSync(credPath, "utf8");

        // Check if credentials contain expiration
        if (credsContent.includes("expiration")) {
          const expirationMatch = credsContent.match(/expiration\s*=\s*(.+)/);

          if (expirationMatch && expirationMatch[1]) {
            const expirationDate = new Date(expirationMatch[1].trim());
            const now = new Date();

            // If expiration is in the future, no need to login
            if (expirationDate > now) {
              console.log(
                "[TokenInitializer] AWS credentials are still valid. Skipping login."
              );
              needsLogin = false;
            }
          }
        }
      }
    } catch (error) {
      console.warn("[TokenInitializer] Error checking AWS credentials:", error);
      // Continue with login to be safe
    }

    if (needsLogin) {
      // For development environment, we'll need to warn the user they need to login
      console.log("\n===================================================");
      console.log("ATTENTION: AWS SSO login is required for token generation.");
      console.log("Please run the following command in a separate terminal:");
      console.log("aws --profile zsso-dev sso login");
      console.log("===================================================\n");

      // Wait for user to complete login (simple approach: fixed delay)
      console.log(
        "[TokenInitializer] Waiting 30 seconds for AWS SSO login to complete..."
      );
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    // Step 2: Run the AWS authorization script
    console.log("[TokenInitializer] Running AWS authorization script...");
    const { stdout: scriptStdout, stderr: scriptStderr } = await execAsync(
      "./aws_authorize.sh"
    );

    if (scriptStderr) {
      console.warn(
        "[TokenInitializer] Warning from AWS authorization script:",
        scriptStderr
      );
    }

    console.log(
      "[TokenInitializer] AWS authorization script output:",
      scriptStdout
    );

    // Step 3: Generate token
    console.log("[TokenInitializer] Generating token...");
    const { stdout, stderr } = await execAsync(
      "python generate_token.py -audience=llm-gateway -csms_prefix=dev/dev-jira"
    );

    if (stderr) {
      console.warn("[TokenInitializer] Warning from token generation:", stderr);
    }

    // Extract token from output
    const lines = stdout.split("\n");
    const tokenLine = lines.find(
      (line) => !line.includes("JWT TOKEN Expire") && line.trim().length > 0
    );

    if (!tokenLine) {
      throw new Error("Could not find token in script output");
    }

    const token = tokenLine.trim();

    // Update .env file with the new token
    await updateEnvFile(token);

    console.log(
      "[TokenInitializer] Successfully generated and saved token using AWS CLI"
    );
    return true;
  } catch (error) {
    console.error(
      "[TokenInitializer] Error generating token with AWS CLI:",
      error
    );
    throw error;
  }
}

/**
 * Update .env file with new token
 */
async function updateEnvFile(token) {
  try {
    const envPath = path.resolve(process.cwd(), ".env");

    // Read current .env file
    let envContent = "";
    try {
      envContent = fs.readFileSync(envPath, "utf8");
    } catch (e) {
      // File doesn't exist, create empty content
      envContent = "";
    }

    // Check if LLM_GATEWAY_JWT_TOKEN already exists
    const tokenRegex = /^LLM_GATEWAY_JWT_TOKEN=.*/m;

    if (tokenRegex.test(envContent)) {
      // Replace existing token
      envContent = envContent.replace(
        tokenRegex,
        `LLM_GATEWAY_JWT_TOKEN=${token}`
      );
    } else {
      // Add new token entry
      envContent += `\nLLM_GATEWAY_JWT_TOKEN=${token}`;
    }

    // Ensure other required configuration exists
    if (!envContent.includes("LLM_GATEWAY_URL")) {
      envContent +=
        "\nLLM_GATEWAY_URL=https://llm-gateway-zmdev-aws-us-east-1.ai.zoomdev.us/v1/chat-bot/invoke";
    }

    if (!envContent.includes("LLM_MODEL")) {
      envContent += "\nLLM_MODEL=claude-3-7-sonnet-20250219";
    }

    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
    console.log(
      "[TokenInitializer] Updated .env file with new token and settings"
    );

    return true;
  } catch (error) {
    console.error("[TokenInitializer] Error updating .env file:", error);
    throw error;
  }
}
