// server/clients/aiStudioClient.js
// Updated to use the existing JWT generation and proxy polling mechanism

import axios from "axios";
import { generateAgentToken } from "../service/jwt_service.js";
import { getAgentConfig } from "../config/agentConfig.js";

// Get the server endpoint from environment variable or use default localhost
const SERVER_ENDPOINT = process.env.SERVER_ENDPOINT || "http://localhost:3030";

/**
 * Submits a question to the specified AI Studio Agent and returns a task ID.
 * @param {string} agentId - The ID of the target agent (e.g., jira_ag, conf_ag).
 * @param {string} query - The question to ask the agent.
 * @param {Array} chatHistory - Optional conversation history.
 * @returns {Promise<string>} - A promise resolving to the task ID.
 */
const submitAgentQuestion = async (agentId, query, chatHistory = []) => {
  try {
    console.log(
      `[aiStudioClient] Submitting question to agent ${agentId}: "${query}"`
    );
    const agentConf = getAgentConfig(agentId);
    const agentToken = generateAgentToken(agentId, agentConf.secretKey);

    // Use the base URL from config for the initial submission
    const submitUrl = agentConf.baseUrl;
    console.log(`[aiStudioClient] Submit URL: ${submitUrl}`);

    const response = await axios.post(
      submitUrl,
      {
        query: query,
        // Include chat history if the agent supports it (optional)
        // chat_history: chatHistory,
      },
      {
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000, // 15 seconds timeout for submission
      }
    );

    // Assuming the response body contains the task ID, e.g., { body: { taskId: "..." } }
    const taskId = response.data?.body?.taskId;
    if (!taskId) {
      console.error(
        "[aiStudioClient] Failed to get taskId from agent submission response:",
        response.data
      );
      throw new Error(`Agent ${agentId} did not return a valid task ID.`);
    }

    console.log(
      `[aiStudioClient] Submitted question to agent ${agentId}, received taskId: ${taskId}`
    );
    return taskId;
  } catch (error) {
    console.error(
      `[aiStudioClient] Error submitting question to agent ${agentId}:`,
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to submit question to agent ${agentId}: ${error.message}`
    );
  }
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
 * @returns {Promise<Array<object>>} - A promise resolving to an array containing the agent's result.
 */
const queryAgent = async (searchQueries, originalQuery, chatHistory = []) => {
  // Determine the target agent based on query or default
  // This logic might need refinement based on how agents are selected
  let agentId = "default"; // Fallback agent ID
  if (originalQuery.toLowerCase().includes("jira")) {
    agentId = "jira_ag";
  } else if (originalQuery.toLowerCase().includes("confluence")) {
    agentId = "conf_ag";
  } else if (originalQuery.toLowerCase().includes("client")) {
    agentId = "MRlQT_lhFw"; // Example client agent ID
  } else if (originalQuery.toLowerCase().includes("zr")) {
    agentId = "zr_ag";
  }
  // Add more rules as needed

  console.log(`[aiStudioClient] Determined target agent: ${agentId}`);

  const queryToSubmit = searchQueries[0] || originalQuery; // Use the first generated query or the original

  try {
    // 1. Submit the question to get the task ID
    const taskId = await submitAgentQuestion(
      agentId,
      queryToSubmit,
      chatHistory
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
