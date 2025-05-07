// server/clients/aiStudioClient.js
// Updated to use the existing JWT generation and proxy polling mechanism

import axios from "axios";
import { generateAgentToken } from "../service/jwt_service.js";
import { getAgentConfig } from "../config/agentConfig.js";

// Get the server endpoint from environment variable or use default localhost
const SERVER_ENDPOINT = process.env.SERVER_ENDPOINT || "http://localhost:3030";

/**
 * Submits a question to the specified AI Studio Agent and returns a task ID.
 * Includes retry logic for authentication failures.
 * 
 * @param {string} agentId - The ID of the target agent (e.g., jira_ag, conf_ag).
 * @param {string} query - The question to ask the agent.
 * @param {Array} chatHistory - Optional conversation history.
 * @param {number} maxRetries - Maximum number of retries for 403 errors (default: 2)
 * @returns {Promise<string>} - A promise resolving to the task ID.
 */
const submitAgentQuestion = async (agentId, query, chatHistory = [], maxRetries = 2) => {
  let retryCount = 0;
  let lastError = null;
  
  // Log environment info (for debugging)
  console.log(`[aiStudioClient] Environment JWT variables for agent ${agentId}:`);
  console.log(`[aiStudioClient] JWT_ISSUER: ${process.env.JWT_ISSUER || 'Not set'}`);
  console.log(`[aiStudioClient] JWT_AUDIENCE: ${process.env.JWT_AUDIENCE || 'Not set'}`);
  
  // Exponential backoff retry loop for authentication issues
  while (retryCount <= maxRetries) {
    try {
      console.log(
        `[aiStudioClient] Submitting question to agent ${agentId} (attempt ${retryCount + 1}/${maxRetries + 1}): "${query}"`
      );
      
      // Get agent configuration
      const agentConf = getAgentConfig(agentId);
      
      // For retry attempts, regenerate token with longer expiry
      const tokenExpiry = 30 + (retryCount * 10); // Increase expiry time with each retry
      const agentToken = generateAgentToken(agentId, agentConf.secretKey, tokenExpiry);

      // Use the base URL from config for the initial submission
      const submitUrl = agentConf.baseUrl;
      console.log(`[aiStudioClient] Submit URL: ${submitUrl}`);

      // Fallback logic: Try a different agent when we get auth errors
      let effectiveAgentId = agentId;
      
      // After the first retry, try an alternate agent if we're targeting jira_ag
      if (agentId === 'jira_ag' && retryCount >= 1) {
        effectiveAgentId = 'conf_ag'; // First fallback: Try Confluence agent
      }
      
      // For the final retry, always fall back to the default agent
      if (retryCount === maxRetries) {
        effectiveAgentId = 'default';
      }
      
      // Log fallback behavior
      if (effectiveAgentId !== agentId) {
        console.log(`[aiStudioClient] Trying fallback agent ${effectiveAgentId} for attempt ${retryCount + 1}`);
      }
        
      // If falling back, regenerate config and token
      const effectiveAgentConf = (effectiveAgentId !== agentId) 
        ? getAgentConfig(effectiveAgentId)
        : agentConf;
      
      // Generate a new token for the fallback agent with shorter expiry
      const effectiveAgentToken = (effectiveAgentId !== agentId)
        ? generateAgentToken(effectiveAgentId, effectiveAgentConf.secretKey, 15) // Shorter expiry for fallback
        : agentToken;
      
      const effectiveSubmitUrl = (effectiveAgentId !== agentId)
        ? effectiveAgentConf.baseUrl
        : submitUrl;
        
      if (effectiveAgentId !== agentId) {
        console.log(`[aiStudioClient] Falling back to agent ${effectiveAgentId} with URL ${effectiveSubmitUrl}`);
      }

      const response = await axios.post(
        effectiveSubmitUrl,
        {
          question: query, // AI Studio expects "question" not "query"
          chat_history: chatHistory || [], // Include chat history in expected format
        },
        {
          headers: {
            Authorization: `Bearer ${effectiveAgentToken}`,
            "Content-Type": "application/json",
          },
          timeout: 15000 + (retryCount * 5000), // Increase timeout with each retry
        }
      );

      // Assuming the response body contains the task ID, e.g., { body: { taskId: "..." } }
      const taskId = response.data?.body?.taskId;
      if (!taskId) {
        console.error(
          "[aiStudioClient] Failed to get taskId from agent submission response:",
          response.data
        );
        throw new Error(`Agent ${effectiveAgentId} did not return a valid task ID.`);
      }

      console.log(
        `[aiStudioClient] Successfully submitted question to agent ${effectiveAgentId}, received taskId: ${taskId}`
      );
      return taskId;
      
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      
      // Retry for auth errors (401 or 403) and other specific errors
      const authErrorCodes = [401, 403];
      const tokenErrorMessage = error.response?.data?.message?.toLowerCase().includes('token');
      
      if ((authErrorCodes.includes(status) || tokenErrorMessage) && retryCount < maxRetries) {
        const backoffTime = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s, etc.
        console.warn(
          `[aiStudioClient] Authentication failed (${status || 'unknown'}) for agent ${agentId}: ${error.response?.data?.message || error.message}, retrying in ${backoffTime/1000}s... (attempt ${retryCount + 1}/${maxRetries})`
        );
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        retryCount++;
      } else {
        // For non-auth errors or if we've exhausted retries, throw the error
        console.error(
          `[aiStudioClient] Error submitting question to agent ${agentId}:`,
          error.response?.data || error.message
        );
        throw new Error(
          `Failed to submit question to agent ${agentId}: ${error.message}`
        );
      }
    }
  }
  
  // If we've exhausted retries and still have an error
  throw lastError || new Error(`Failed to submit question to agent ${agentId} after ${maxRetries} retries`);
};

/**
 * Polls the backend proxy endpoint until the agent task is complete.
 * @param {string} agentId - The ID of the agent.
 * @param {string} taskId - The task ID received from submission.
 * @param {number} maxAttempts - Maximum number of polling attempts.
 * @param {number} intervalMs - Interval between polling attempts in milliseconds.
 * @returns {Promise<object>} - A promise resolving to the agent's result.
 */
const pollAgentResult = async (
  agentId,
  taskId,
  maxAttempts = 10,
  intervalMs = 3000
) => {
  console.log(
    `[aiStudioClient] Starting to poll for taskId ${taskId} (agent ${agentId})`
  );
  const pollUrl = `${SERVER_ENDPOINT}/api/proxy-agent-poll`; // Use the backend proxy endpoint

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `[aiStudioClient] Polling attempt ${attempt}/${maxAttempts} for taskId ${taskId}`
    );
    try {
      const response = await axios.post(
        pollUrl,
        {
          agentId: agentId,
          taskId: taskId,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 5000, // 5 seconds timeout for polling
        }
      );

      const data = response.data;
      console.log(`[aiStudioClient] Poll response:`, data);

      if (data.success && data.status === "complete") {
        console.log(
          `[aiStudioClient] Task ${taskId} complete. Result:`,
          data.result
        );
        // Return the result in a format expected by OrchestrationService
        // Assuming data.result is the answer string
        return {
          title: data.question || `Result for ${agentId}`,
          summary: data.result, // The main answer
          search_engine: `AI Studio Agent (${agentId})`,
          url: null, // No specific URL for agent response
          chunks: [],
          extra: { taskId: taskId, rawResponse: data.rawResponse }, // Include raw response if needed
        };
      } else if (data.success && data.status === "pending") {
        // Task still pending, wait and try again
        console.log(`[aiStudioClient] Task ${taskId} still pending...`);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } else {
        // Polling returned an error status
        console.error(
          `[aiStudioClient] Polling failed for taskId ${taskId}:`,
          data.error
        );
        throw new Error(
          data.error || `Polling failed with status ${data.status}`
        );
      }
    } catch (error) {
      console.error(
        `[aiStudioClient] Error during polling attempt ${attempt} for taskId ${taskId}:`,
        error.response?.data || error.message
      );
      // If it's the last attempt, throw the error
      if (attempt === maxAttempts) {
        throw new Error(
          `Failed to get result for task ${taskId} after ${maxAttempts} attempts: ${error.message}`
        );
      }
      // Wait before retrying after an error
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  // Should not reach here if maxAttempts > 0
  throw new Error(`Polling loop finished unexpectedly for task ${taskId}`);
};

/**
 * Queries the specified AI Studio Agent by submitting the question and polling for the result.
 * @param {string[]} searchQueries - List of queries (using the first one for now).
 * @param {string} originalQuery - The original user query.
 * @param {Array} chatHistory - Conversation history.
 * @param {string} forceAgentId - Optional specific agent ID to use.
 * @returns {Promise<Array<object>>} - A promise resolving to an array containing the agent's result.
 */
const queryAgent = async (searchQueries, originalQuery, chatHistory = [], forceAgentId = null) => {
  // Determine the target agent based on query or default
  let agentId = forceAgentId || "default"; // Use forced ID or fallback
  
  // Only determine agent from query if not forced
  if (!forceAgentId) {
    if (originalQuery.toLowerCase().includes("jira") || 
        originalQuery.toLowerCase().includes("ticket") ||
        originalQuery.toLowerCase().includes("zsee")) {
      agentId = "jira_ag";
    } else if (originalQuery.toLowerCase().includes("confluence") || 
               originalQuery.toLowerCase().includes("wiki") ||
               originalQuery.toLowerCase().includes("document")) {
      agentId = "conf_ag";
    } else if (originalQuery.toLowerCase().includes("client") || 
               originalQuery.toLowerCase().includes("zoom client")) {
      agentId = "MRlQT_lhFw"; // Client agent ID
    } else if (originalQuery.toLowerCase().includes("zr") ||
               originalQuery.toLowerCase().includes("zoom rooms")) {
      agentId = "zr_ag";
    }
  }

  console.log(`[aiStudioClient] Determined target agent: ${agentId}`);

  const queryToSubmit = searchQueries[0] || originalQuery; // Use the first generated query or the original
  console.log(`[aiStudioClient] Using query: "${queryToSubmit}"`);

  // Format chat history for AI Studio API if provided
  const formattedChatHistory = Array.isArray(chatHistory) ? 
    chatHistory.map(entry => ({
      human: entry.user || entry.human || "",
      ai: entry.assistant || entry.ai || entry.gemini || ""
    })) : [];

  try {
    // 1. Submit the question to get the task ID with properly formatted chat history
    const taskId = await submitAgentQuestion(
      agentId,
      queryToSubmit,
      formattedChatHistory
    );

    // 2. Poll for the result using the task ID
    const result = await pollAgentResult(agentId, taskId);

    // Return the result in an array as expected by OrchestrationService
    return [result];
  } catch (error) {
    console.error(`[aiStudioClient] Failed to query agent ${agentId}:`, error);
    // Return an empty array or an error object in the expected format
    return [
      {
        title: `Error querying Agent ${agentId}`,
        summary: `Failed to get response: ${error.message}`,
        search_engine: `AI Studio Agent (${agentId})`,
        error: true,
      },
    ];
  }
};

export default {
  queryAgent,
};
