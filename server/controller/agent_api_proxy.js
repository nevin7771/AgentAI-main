// server/controller/agent_api_proxy.js
import axios from "axios";
import { generateAgentToken } from "../service/jwt_service.js";

// API base URL for all agents
const API_BASE_URL = "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw";

// Hardcoded fallback URLs for specific agents if not found in environment
const FALLBACK_AGENT_URLS = {
  conf_ag: `${API_BASE_URL}?skillSettingId=conf_ag`,
  client_agent: `${API_BASE_URL}?skillSettingId=client_agent`,
  zr_ag: `${API_BASE_URL}?skillSettingId=zr_ag`,
  jira_ag: `${API_BASE_URL}?skillSettingId=jira_ag`,
  zp_ag: `${API_BASE_URL}?skillSettingId=zp_ag`
};

/**
 * Proxy polling requests to Zoom agent APIs
 * This avoids CORS issues because our server can make these requests
 * while the browser cannot directly due to missing CORS headers
 */
export const proxyAgentPoll = async (req, res) => {
  try {
    console.log("[Proxy] Received agent poll request:", req.body);
    
    const { agentId, taskId } = req.body;

    if (!agentId || !taskId) {
      console.error("[Proxy] Missing required parameters:", { body: req.body });
      return res.status(400).json({
        success: false,
        error: "Agent ID and Task ID are required"
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
        console.warn(`API URL for agent ${agentId} not found in environment variables, using default URL`);
        
        // Default API base URL with skillSettingId parameter
        endpoint = `${API_BASE_URL}?skillSettingId=${agentId}`;
      }
    }

    // Get agent-specific JWT secret
    const agentSecret = process.env[`${agentId.toUpperCase()}_JWT_SECRET`] 
      || process.env.JWT_SECRET_KEY 
      || "gzazjvdts768lelcbcyy5ecpkiguthmq"; // Add fallback default
    
    console.log(`Using secret for agent ${agentId}: ${agentSecret ? "Secret found" : "No secret"}`);
    
    // Generate agent-specific token
    const agentToken = generateAgentToken(agentId, agentSecret);

    // Modify endpoint based on whether it already has a query parameter
    let finalEndpoint;
    if (endpoint.includes('?')) {
      // Add taskId as an additional parameter
      finalEndpoint = `${endpoint}&taskId=${taskId}`;
    } else {
      // Add taskId as the first parameter
      finalEndpoint = `${endpoint}?taskId=${taskId}`;
    }
    
    console.log(`[Proxy] Polling agent ${agentId} with taskId ${taskId} at endpoint: ${finalEndpoint}`);
    
    // Make the API request with direct URL
    const response = await axios.get(finalEndpoint, {
      headers: {
        Authorization: `Bearer ${agentToken}`,
        "Content-Type": "application/json"
      },
      timeout: 10000 // 10 seconds timeout
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
        taskId
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
          rawResponse: responseData
        });
      } else {
        return res.status(500).json({
          success: false,
          status: "error",
          error: `No result found in response from ${agentId}`,
          agentId,
          taskId
        });
      }
    } else {
      return res.status(500).json({
        success: false,
        status: "error",
        error: `Unexpected status ${status} from ${agentId}`,
        agentId,
        taskId
      });
    }
  } catch (error) {
    console.error("[Proxy] Error proxying agent poll:", error);
    res.status(500).json({
      success: false,
      status: "error",
      error: error.message || "An unknown error occurred",
      details: error.response?.data || "No additional details available"
    });
  }
};