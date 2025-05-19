// server/clients/dayOneClient.js
import axios from "axios";
import { spawn } from "child_process";
import { promisify } from "util";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const execAsync = promisify(exec);
// DayOne API client for Confluence and Monitor agents
class DayOneClient {
  constructor() {
    this.baseUrl =
      process.env.DAYONE_API_URL ||
      "https://new-dayone.zoomdev.us/api/v1/edo/service/ai/stream";
    this.tokenAudience = process.env.DAYONE_TOKEN_AUDIENCE || "edo";
    this.tokenCsmsPrefix = process.env.DAYONE_TOKEN_CSMS_PREFIX || "dev/edo";
    // Function IDs for different agents
    this.functionIds = {
      confluence:
        process.env.DAYONE_CONFLUENCE_FUNCTION_ID ||
        "210169ae-760f-4fae-8a82-e16fc9b5b78f", // Replace with actual ID
      monitor:
        process.env.DAYONE_MONITOR_FUNCTION_ID ||
        "c46de244-ea9b-4a47-be9d-d40f816da925", // Replace with actual ID
    };
    // Initialize token
    this.token = null;
    this.tokenExpiry = null;
    this.isGeneratingToken = false;
    this.tokenCallbacks = [];
  }

  // Generate a token using the Python script
  async generateToken() {
    if (this.isGeneratingToken) {
      // If a token generation is already in progress, wait for it to complete
      return new Promise((resolve, reject) => {
        this.tokenCallbacks.push({ resolve, reject });
      });
    }

    this.isGeneratingToken = true;
    console.log("[DayOneClient] Generating token using Python script...");

    try {
      // Run the Python script
      const { stdout, stderr } = await execAsync(
        `python generate_token.py -audience=${this.tokenAudience} -csms_prefix=${this.tokenCsmsPrefix}`
      );

      if (stderr) {
        console.warn("[DayOneClient] Warning from token generation:", stderr);
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

      // Parse expiry time from output if available
      const expiryLine = lines.find((line) =>
        line.includes("JWT TOKEN Expire")
      );
      let expiry = new Date();
      if (expiryLine) {
        try {
          const expiryMatch = expiryLine.match(/Expire at:\s*(.+)/);
          if (expiryMatch && expiryMatch[1]) {
            expiry = new Date(expiryMatch[1].trim());
          } else {
            // Default expiry of 1 hour from now
            expiry.setHours(expiry.getHours() + 1);
          }
        } catch (e) {
          console.warn("[DayOneClient] Could not parse token expiry time:", e);
          expiry.setHours(expiry.getHours() + 1); // Default 1 hour
        }
      } else {
        // Default expiry of 1 hour from now
        expiry.setHours(expiry.getHours() + 1);
      }

      // Update .env file with the new token
      await this.updateEnvFile(token);

      // Set token and expiry
      this.token = token;
      this.tokenExpiry = expiry;

      console.log(
        "[DayOneClient] Successfully generated token, expires:",
        expiry.toISOString()
      );

      // Resolve any pending callbacks
      this.tokenCallbacks.forEach((callback) => callback.resolve(token));
      this.tokenCallbacks = [];

      return token;
    } catch (error) {
      console.error("[DayOneClient] Error generating token:", error);

      // Reject any pending callbacks
      this.tokenCallbacks.forEach((callback) => callback.reject(error));
      this.tokenCallbacks = [];

      throw error;
    } finally {
      this.isGeneratingToken = false;
    }
  }

  // Update .env file with new token
  async updateEnvFile(token) {
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

      // Check if DAYONE_JWT_TOKEN already exists
      const tokenRegex = /^DAYONE_JWT_TOKEN=.*/m;

      if (tokenRegex.test(envContent)) {
        // Replace existing token
        envContent = envContent.replace(
          tokenRegex,
          `DAYONE_JWT_TOKEN=${token}`
        );
      } else {
        // Add new token entry
        envContent += `\nDAYONE_JWT_TOKEN=${token}`;
      }

      // Write updated content back to .env file
      fs.writeFileSync(envPath, envContent);
      console.log("[DayOneClient] Updated .env file with new DayOne token");

      // Reload environment variables
      dotenv.config();
      return true;
    } catch (error) {
      console.error("[DayOneClient] Error updating .env file:", error);
      throw error;
    }
  }

  // Check if the token is valid
  async ensureValidToken() {
    // Get token from environment in case it was updated externally
    const envToken = process.env.DAYONE_JWT_TOKEN;
    if (envToken && envToken !== this.token) {
      this.token = envToken;
    }

    // If no token or expired, generate a new one
    if (!this.token || !this.tokenExpiry || new Date() >= this.tokenExpiry) {
      console.log(
        "[DayOneClient] Token missing or expired, generating new token"
      );
      return this.generateToken();
    }

    return this.token;
  }

  // Make streaming request to Day One API
  async streamQuestion(agentType, question, onChunkReceived) {
    const functionId = this.functionIds[agentType];
    if (!functionId) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }

    // Ensure we have a valid token
    const token = await this.ensureValidToken();

    console.log(
      `[${agentType.toUpperCase()}] Sending request to Day One API with function ID: ${functionId}`
    );

    // Create request config with streaming enabled
    const config = {
      method: "post",
      url: this.baseUrl,
      data: {
        functionId: functionId,
        question: question,
      },
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      responseType: "stream",
    };

    // Make the request
    try {
      const response = await axios(config);
      let combinedMessage = "";
      let messageBuffer = "";

      // Handle the streaming response
      response.data.on("data", (chunk) => {
        const chunkStr = chunk.toString();
        console.log(
          `[${agentType.toUpperCase()}] Raw chunk:`,
          chunkStr.substring(0, 50) + "..."
        );

        // Process chunk which may contain multiple data: sections
        messageBuffer += chunkStr;

        // Process complete chunks (SSE format)
        while (messageBuffer.includes("\n\n")) {
          const parts = messageBuffer.split("\n\n");
          const completePart = parts[0];
          messageBuffer = parts.slice(1).join("\n\n");

          // Extract JSON from the data: prefix
          if (completePart.startsWith("data:")) {
            try {
              const jsonStr = completePart.substring(5).trim();
              const jsonData = JSON.parse(jsonStr);

              if (jsonData.message) {
                combinedMessage += jsonData.message;
                // Call the callback with the current state
                onChunkReceived({
                  message: combinedMessage,
                  partialMessage: jsonData.message,
                  status: jsonData.status || "pending",
                  functionId: functionId,
                  type: agentType,
                });
              }
            } catch (e) {
              console.error(
                `[${agentType.toUpperCase()}] Error parsing JSON from chunk:`,
                e
              );
            }
          }
        }
      });

      // Handle stream end
      return new Promise((resolve, reject) => {
        response.data.on("end", () => {
          console.log(`[${agentType.toUpperCase()}] Stream complete`);
          resolve({
            success: true,
            message: combinedMessage,
            functionId: functionId,
            type: agentType,
          });
        });

        response.data.on("error", (err) => {
          console.error(`[${agentType.toUpperCase()}] Stream error:`, err);
          reject(err);
        });
      });
    } catch (error) {
      console.error(
        `[${agentType.toUpperCase()}] Request error:`,
        error.message
      );
      throw error;
    }
  }
}

// Create a singleton instance
const dayOneClient = new DayOneClient();

export default dayOneClient;
