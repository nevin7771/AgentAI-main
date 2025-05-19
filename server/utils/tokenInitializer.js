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
 * Initialize the LLM Gateway token and Day One token
 * This runs during server startup to ensure valid tokens are available
 */
export async function initializeToken() {
  console.log("[TokenInitializer] Starting token initialization...");

  try {
    // Check if LLM Gateway token exists and is valid
    if (await isTokenValid("LLM_GATEWAY_JWT_TOKEN")) {
      console.log(
        "[TokenInitializer] Existing LLM Gateway token is valid. Using it."
      );
    } else {
      // Token doesn't exist or is invalid - generate a new one
      console.log(
        "[TokenInitializer] LLM Gateway token missing or invalid. Generating new token..."
      );

      if (isProduction) {
        // In production (EC2), use instance profile
        await generateTokenWithInstanceProfile(
          "llm-gateway",
          "dev/dev-jira",
          "LLM_GATEWAY_JWT_TOKEN"
        );
      } else {
        // In development, use AWS CLI
        await generateTokenWithAwsCli(
          "llm-gateway",
          "dev/dev-jira",
          "LLM_GATEWAY_JWT_TOKEN"
        );
      }
    }

    // Check if Day One token exists and is valid
    if (await isTokenValid("DAYONE_JWT_TOKEN")) {
      console.log(
        "[TokenInitializer] Existing Day One token is valid. Using it."
      );
    } else {
      // Token doesn't exist or is invalid - generate a new one
      console.log(
        "[TokenInitializer] Day One token missing or invalid. Generating new token..."
      );

      if (isProduction) {
        // In production (EC2), use instance profile
        await generateTokenWithInstanceProfile(
          "edo",
          "dev/edo",
          "DAYONE_JWT_TOKEN"
        );
      } else {
        // In development, use AWS CLI
        await generateTokenWithAwsCli("edo", "dev/edo", "DAYONE_JWT_TOKEN");
      }
    }

    // Reload environment variables after token updates
    dotenv.config();

    return true;
  } catch (error) {
    console.error("[TokenInitializer] Error initializing tokens:", error);
    // Don't fail server startup - just log the error
    // The server can still run, and requests that need the token will fail individually
    return false;
  }
}

/**
 * Check if the current token is valid
 * @param {string} tokenEnvName - Environment variable name for the token
 */
async function isTokenValid(tokenEnvName) {
  // Simple check: token exists and env file was modified less than 6 days ago
  const token = process.env[tokenEnvName];

  if (!token) {
    console.log(
      `[TokenInitializer] No ${tokenEnvName} found in environment variables`
    );
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
      `[TokenInitializer] ${tokenEnvName} is ${daysSinceUpdate.toFixed(
        1
      )} days old. Valid: ${isValid}`
    );

    return isValid;
  } catch (error) {
    console.error(
      `[TokenInitializer] Error checking ${tokenEnvName} validity:`,
      error
    );
    return false;
  }
}

/**
 * Generate token using EC2 instance profile (for production)
 * @param {string} audience - Token audience
 * @param {string} csmsPrefix - CSMS prefix
 * @param {string} tokenEnvName - Environment variable name for the token
 */
async function generateTokenWithInstanceProfile(
  audience,
  csmsPrefix,
  tokenEnvName
) {
  console.log(
    `[TokenInitializer] Generating ${tokenEnvName} token using EC2 instance profile...`
  );

  try {
    // For EC2 instances with instance profile, no need to get credentials
    // The AWS SDK will use the instance profile automatically
    // Just run the token generation script
    const { stdout, stderr } = await execAsync(
      `python generate_token.py -audience=${audience} -csms_prefix=${csmsPrefix}`
    );

    if (stderr) {
      console.warn(
        `[TokenInitializer] Warning from ${tokenEnvName} generation:`,
        stderr
      );
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
    await updateEnvFile(token, tokenEnvName);

    console.log(
      `[TokenInitializer] Successfully generated and saved ${tokenEnvName} using instance profile`
    );
    return true;
  } catch (error) {
    console.error(
      `[TokenInitializer] Error generating ${tokenEnvName} with instance profile:`,
      error
    );
    throw error;
  }
}

/**
 * Generate token using AWS CLI (for development)
 * @param {string} audience - Token audience
 * @param {string} csmsPrefix - CSMS prefix
 * @param {string} tokenEnvName - Environment variable name for the token
 */
async function generateTokenWithAwsCli(audience, csmsPrefix, tokenEnvName) {
  console.log(`[TokenInitializer] Generating ${tokenEnvName} using AWS CLI...`);

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
      console.log("aws --profile zoom-sso-dev sso login");
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
    console.log(`[TokenInitializer] Generating ${tokenEnvName}...`);
    const { stdout, stderr } = await execAsync(
      `python generate_token.py -audience=${audience} -csms_prefix=${csmsPrefix}`
    );

    if (stderr) {
      console.warn(
        `[TokenInitializer] Warning from ${tokenEnvName} generation:`,
        stderr
      );
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
    await updateEnvFile(token, tokenEnvName);

    console.log(
      `[TokenInitializer] Successfully generated and saved ${tokenEnvName} using AWS CLI`
    );
    return true;
  } catch (error) {
    console.error(
      `[TokenInitializer] Error generating ${tokenEnvName} with AWS CLI:`,
      error
    );
    throw error;
  }
}

/**
 * Update .env file with new token
 * @param {string} token - The JWT token
 * @param {string} tokenEnvName - Environment variable name for the token
 */
async function updateEnvFile(token, tokenEnvName) {
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

    // Check if token variable already exists
    const tokenRegex = new RegExp(`^${tokenEnvName}=.*`, "m");

    if (tokenRegex.test(envContent)) {
      // Replace existing token
      envContent = envContent.replace(tokenRegex, `${tokenEnvName}=${token}`);
    } else {
      // Add new token entry
      envContent += `\n${tokenEnvName}=${token}`;
    }

    // Ensure other required configuration exists
    if (tokenEnvName === "LLM_GATEWAY_JWT_TOKEN") {
      if (!envContent.includes("LLM_GATEWAY_URL")) {
        envContent +=
          "\nLLM_GATEWAY_URL=https://llm-gateway-zmdev-aws-us-east-1.ai.zoomdev.us/v1/chat-bot/invoke";
      }

      if (!envContent.includes("LLM_MODEL")) {
        envContent += "\nLLM_MODEL=claude-3-7-sonnet-20250219";
      }
    } else if (tokenEnvName === "DAYONE_JWT_TOKEN") {
      if (!envContent.includes("DAYONE_API_URL")) {
        envContent +=
          "\nDAYONE_API_URL=https://new-dayone.zoomdev.us/api/v1/edo/service/ai/stream";
      }

      if (!envContent.includes("DAYONE_FUNCTION_ID")) {
        envContent +=
          "\nDAYONE_FUNCTION_ID=210169ae-760f-4fae-8a82-e16fc9b5b78f";
      }

      if (!envContent.includes("MONITOR_FUNCTION_ID")) {
        envContent +=
          "\nMONITOR_FUNCTION_ID=c46de244-ea9b-4a47-be9d-d40f816da925";
      }

      if (!envContent.includes("CONFLUENCE_FUNCTION_ID")) {
        envContent +=
          "\nCONFLUENCE_FUNCTION_ID=210169ae-760f-4fae-8a82-e16fc9b5b78f";
      }
    }

    // Write updated content back to .env file
    fs.writeFileSync(envPath, envContent);
    console.log(
      `[TokenInitializer] Updated .env file with new ${tokenEnvName} and settings`
    );

    return true;
  } catch (error) {
    console.error("[TokenInitializer] Error updating .env file:", error);
    throw error;
  }
}
