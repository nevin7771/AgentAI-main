// server/controller/agent_api_proxy.js
import axios from "axios";
import { generateAgentToken } from "../service/jwt_service.js";
import { formatAgentResponse } from "../utils/agentResponseCombiner.js";
import { DeepResearchAgent } from "../agents/index.js";

// API base URL for all agents
const API_BASE_URL = "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/";
const JIRA_API_BASE_URL =
  "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/tt6w7wNWQUOn5UBPCUi2mg";

// Hardcoded fallback URLs for specific agents if not found in environment
const FALLBACK_AGENT_URLS = {
  conf_ag: `${JIRA_API_BASE_URL}?skillSettingId=conf_ag`,
  client_agent: `${API_BASE_URL}?skillSettingId=client_agent`,
  zr_ag: `${API_BASE_URL}?skillSettingId=zr_ag`,
  jira_ag: `${JIRA_API_BASE_URL}?skillSettingId=jira_ag`,
  zp_ag: `${API_BASE_URL}?skillSettingId=zp_ag`,
};

/**
 * Proxy polling requests to Zoom agent APIs
 * This avoids CORS issues because our server can make these requests
 * while the browser cannot directly due to missing CORS headers
 */
export const proxyAgentPoll = async (req, res) => {
  try {
    console.log("[Proxy] Received agent poll request:", req.body);

    const { agentId, taskId, question } = req.body;

    if (!agentId) {
      console.error("[Proxy] Missing agentId parameter:", { body: req.body });
      return res.status(400).json({
        success: false,
        error: "Agent ID is required",
      });
    }

    // If we have a question but no taskId, this is a new request, not a poll
    if (question && !taskId) {
      return handleDirectAgentRequest(req, res);
    }

    // For local development without external APIs, use our local implementation
    if (agentId === "local" || process.env.USE_LOCAL_AGENTS === "true") {
      console.log(
        "[Proxy] Using local agent implementation instead of external API"
      );
      return handleLocalAgentRequest(req, res);
    }

    // If taskId is missing for a poll request, return an error
    if (!taskId) {
      console.error("[Proxy] Missing taskId parameter for poll request:", {
        body: req.body,
      });
      return res.status(400).json({
        success: false,
        error: "Task ID is required for polling",
      });
    }

    // Get agent-specific endpoint from environment variables
    let endpoint = process.env[`${agentId.toUpperCase()}_API_URL`];

    // Fallback to default if not found
    if (!endpoint) {
      // Try agent-specific fallback URL first
      if (FALLBACK_AGENT_URLS[agentId]) {
        console.warn(`Using fallback URL for agent ${agentId}`);
        endpoint = FALLBACK_AGENT_URLS[agentId];
      } else {
        console.warn(
          `API URL for agent ${agentId} not found in environment variables, using default URL`
        );

        // Default API base URL with skillSettingId parameter
        endpoint = `${API_BASE_URL}?skillSettingId=${agentId}`;
      }
    }

    // Get agent-specific JWT secret
    const agentSecret =
      process.env[`${agentId.toUpperCase()}_JWT_SECRET`] ||
      process.env.JWT_SECRET_KEY ||
      "xh94swe59q03xi1felkuxdntkn5gd9zt"; // Add fallback default

    console.log(
      `Using secret for agent ${agentId}: ${
        agentSecret ? "Secret found" : "No secret"
      }`
    );

    // Generate agent-specific token
    const agentToken = generateAgentToken(agentId, agentSecret);

    // Modify endpoint based on whether it already has a query parameter
    let finalEndpoint;
    if (endpoint.includes("?")) {
      // Add taskId as an additional parameter
      finalEndpoint = `${endpoint}&taskId=${taskId}`;
    } else {
      // Add taskId as the first parameter
      finalEndpoint = `${endpoint}?taskId=${taskId}`;
    }

    console.log(
      `[Proxy] Polling agent ${agentId} with taskId ${taskId} at endpoint: ${finalEndpoint}`
    );

    // Make the API request with direct URL
    try {
      const response = await axios.get(finalEndpoint, {
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 seconds timeout
      });

      const responseData = response.data;
      console.log(`[Proxy] Poll response from ${agentId}:`, responseData);

      // Check status (status 1 = pending, 2,3,4 = complete)
      const status = responseData.body?.status;

      if (status === 1) {
        // Still pending
        return res.status(200).json({
          success: true,
          status: "pending",
          agentId,
          taskId,
        });
      } else if (status === 2 || status === 3 || status === 4) {
        // Complete - extract result from response
        const result = responseData.body?.result;
        if (result) {
          // Extract the answer from the result
          // The frontend expects just the answer as the result, not the full object
          const answer = result.answer || result;
          const question = result.question || "Agent query";

          console.log(`Formatted answer for agent ${agentId}:`, answer);

          // Format the response to match what the UI component expects
          return res.status(200).json({
            success: true,
            status: "complete",
            agentId,
            taskId,
            result: answer, // Just send the answer string, not the full object
            question: question,
            rawResponse: responseData,
          });
        } else {
          return res.status(500).json({
            success: false,
            status: "error",
            error: `No result found in response from ${agentId}`,
            agentId,
            taskId,
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          status: "error",
          error: `Unexpected status ${status} from ${agentId}`,
          agentId,
          taskId,
        });
      }
    } catch (error) {
      console.error(
        `[Proxy] Error making request to ${finalEndpoint}:`,
        error.message
      );

      // Try local implementation as fallback
      return handleLocalAgentRequest(req, res);
    }
  } catch (error) {
    console.error("[Proxy] Error proxying agent poll:", error);
    res.status(500).json({
      success: false,
      status: "error",
      error: error.message || "An unknown error occurred",
      details: error.response?.data || "No additional details available",
    });
  }
};

/**
 * Handle a direct agent request (with question but no taskId)
 */
const handleDirectAgentRequest = async (req, res) => {
  try {
    const { agentId, question } = req.body;

    console.log(`[Proxy] Direct agent request for ${agentId}: "${question}"`);

    // Get agent-specific endpoint from environment variables
    let endpoint = process.env[`${agentId.toUpperCase()}_API_URL`];

    // Fallback to default if not found
    if (!endpoint) {
      // Try agent-specific fallback URL first
      if (FALLBACK_AGENT_URLS[agentId]) {
        console.warn(`Using fallback URL for agent ${agentId}`);
        endpoint = FALLBACK_AGENT_URLS[agentId];
      } else {
        console.warn(
          `API URL for agent ${agentId} not found in environment variables, using default URL`
        );

        // Default API base URL with skillSettingId parameter
        endpoint = `${API_BASE_URL}?skillSettingId=${agentId}`;
      }
    }

    // Get agent-specific JWT secret
    const agentSecret =
      process.env[`${agentId.toUpperCase()}_JWT_SECRET`] ||
      process.env.JWT_SECRET_KEY ||
      "xh94swe59q03xi1felkuxdntkn5gd9zt"; // Add fallback default

    console.log(
      `Using secret for agent ${agentId}: ${
        agentSecret ? "Secret found" : "No secret"
      }`
    );

    // Generate agent-specific token
    const agentToken = generateAgentToken(agentId, agentSecret);

    // Prepare the request payload
    const payload = {
      question,
      chat_history: [],
    };

    console.log(
      `[Proxy] Sending agent request to ${endpoint} with payload:`,
      payload
    );

    try {
      // Make the POST request to create a task
      const response = await axios.post(endpoint, payload, {
        headers: {
          Authorization: `Bearer ${agentToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 seconds timeout
      });

      const responseData = response.data;
      console.log(
        `[Proxy] Task creation response from ${agentId}:`,
        responseData
      );

      // Extract the taskId from the response
      const taskId = responseData.body?.taskId;

      if (!taskId) {
        console.error("[Proxy] No taskId returned from agent API");
        throw new Error("No taskId returned from agent API");
      }

      // Return the taskId to the client
      return res.status(200).json({
        success: true,
        status: "pending",
        taskId,
        agentId,
        question,
      });
    } catch (error) {
      console.error(`[Proxy] Error sending request to API: ${error.message}`);
      console.log("[Proxy] Falling back to local agent implementation");
      // If API request fails, fall back to local implementation
      return handleLocalAgentRequest(req, res);
    }
  } catch (error) {
    console.error("[Proxy] Error handling direct agent request:", error);
    return res.status(500).json({
      success: false,
      status: "error",
      error: error.message || "An unknown error occurred",
    });
  }
};

/**
 * Use local agent implementation instead of external API
 */
const handleLocalAgentRequest = async (req, res) => {
  try {
    const { agentId, question, taskId } = req.body;

    if (!question && !taskId) {
      return res.status(400).json({
        success: false,
        error: "Either question or taskId is required",
      });
    }

    // If we have a taskId but no question, it's a poll request
    if (taskId && !question) {
      try {
        // Get agent-specific endpoint from environment variables
        let endpoint = process.env[`${agentId.toUpperCase()}_API_URL`];

        // Fallback to default if not found
        if (!endpoint) {
          // Try agent-specific fallback URL first
          if (FALLBACK_AGENT_URLS[agentId]) {
            console.warn(`Using fallback URL for agent ${agentId}`);
            endpoint = FALLBACK_AGENT_URLS[agentId];
          } else {
            console.warn(
              `API URL for agent ${agentId} not found in environment variables, using default URL`
            );

            // Default API base URL with skillSettingId parameter
            endpoint = `${API_BASE_URL}?skillSettingId=${agentId}`;
          }
        }

        // Get agent-specific JWT secret
        const agentSecret =
          process.env[`${agentId.toUpperCase()}_JWT_SECRET`] ||
          process.env.JWT_SECRET_KEY ||
          "xh94swe59q03xi1felkuxdntkn5gd9zt"; // Add fallback default

        console.log(
          `Using secret for agent ${agentId}: ${
            agentSecret ? "Secret found" : "No secret"
          }`
        );

        // Generate agent-specific token
        const agentToken = generateAgentToken(agentId, agentSecret);

        // Modify endpoint based on whether it already has a query parameter
        let finalEndpoint;
        if (endpoint.includes("?")) {
          // Add taskId as an additional parameter
          finalEndpoint = `${endpoint}&taskId=${taskId}`;
        } else {
          // Add taskId as the first parameter
          finalEndpoint = `${endpoint}?taskId=${taskId}`;
        }

        console.log(
          `[Proxy] Polling agent ${agentId} with taskId ${taskId} at endpoint: ${finalEndpoint}`
        );

        const response = await axios.get(finalEndpoint, {
          headers: {
            Authorization: `Bearer ${agentToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000, // 10 seconds timeout
        });

        const responseData = response.data;
        console.log(`[Proxy] Poll response from ${agentId}:`, responseData);

        // Check status (status 1 = pending, 2,3,4 = complete)
        const status = responseData.body?.status;

        if (status === 1) {
          // Still pending
          return res.status(200).json({
            success: true,
            status: "pending",
            agentId,
            taskId,
          });
        } else if (status === 2 || status === 3 || status === 4) {
          // Complete - extract result from response
          const result = responseData.body?.result;
          if (result) {
            // Extract the answer from the result
            const answer = result.answer || result;
            const question = result.question || "Agent query";

            console.log(`Formatted answer for agent ${agentId}:`, answer);

            return res.status(200).json({
              success: true,
              status: "complete",
              agentId,
              taskId,
              result: answer,
              question: question,
              rawResponse: responseData,
            });
          } else {
            throw new Error(`No result found in response from ${agentId}`);
          }
        } else {
          throw new Error(`Unexpected status ${status} from ${agentId}`);
        }
      } catch (error) {
        console.error(`[Proxy] Error polling external API: ${error.message}`);
        console.log("[Proxy] Using local agent implementation as fallback");

        // Create and process with local agent instead
        const agent = new DeepResearchAgent();
        const result = await agent.processQuery(`Query for taskId ${taskId}`);
        const formattedHtml = formatAgentResponse(
          result,
          "Local Agent (Fallback)"
        );

        return res.status(200).json({
          success: true,
          status: "complete",
          agentId,
          taskId,
          result: formattedHtml,
          question: "Query processed by local agent (external API unavailable)",
          note: "This is a fallback response because the external API was unavailable",
        });
      }
    }

    console.log(`[Proxy] Using local agent to process: "${question}"`);

    // Create a local agent instance
    const agent = new DeepResearchAgent();

    // Process the query
    const result = await agent.processQuery(question);

    // Format the response
    const formattedHtml = formatAgentResponse(result, "Local Agent");

    return res.status(200).json({
      success: true,
      status: "complete",
      agentId,
      taskId: taskId || `local_${Date.now()}`,
      question,
      result: formattedHtml,
      data: {
        answer: formattedHtml,
        sources: result.sources || [],
        metadata: result.metadata || {},
      },
    });
  } catch (error) {
    console.error("[Proxy] Error in local agent implementation:", error);
    return res.status(500).json({
      success: false,
      status: "error",
      error:
        error.message || "An unknown error occurred in local agent processing",
    });
  }
};
