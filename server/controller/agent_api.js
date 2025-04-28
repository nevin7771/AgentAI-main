// server/controller/agent_api.js
import { generateJwtToken, verifyToken, generateAgentToken } from "../service/jwt_service.js";
import axios from "axios";
import { chat } from "../model/chat.js";
import { chatHistory } from "../model/chatHistory.js";
import { combineAgentResponses } from "../utils/agentResponseCombiner.js";

// Each agent has its own URL configured via environment variables

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

// Store tasks in memory (in production, use Redis or a database)
const taskStore = new Map();

/**
 * Generate a JWT token for agent API authentication
 */
export const generateToken = async (req, res) => {
  try {
    const tokenData = generateJwtToken();

    res.status(200).json({
      success: true,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
    });
  } catch (error) {
    console.error("Error generating token:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate token",
    });
  }
};

/**
 * Submit a question to one or more agents
 */
export const submitQuestion = async (req, res) => {
  try {
    const { question, agents, chatHistoryId } = req.body;

    if (!question) {
      return res.status(400).json({
        success: false,
        error: "Question is required",
      });
    }

    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one agent must be selected",
      });
    }

    // Generate a single token for all agents
    const tokenData = generateJwtToken();
    const token = tokenData.token;

    // Process each agent in parallel
    const taskResults = {};
    const taskErrors = {};

    await Promise.all(
      agents.map(async (agentId) => {
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
              console.warn(`API URL for agent ${agentId} not found in environment variables, using default URL`);
              
              // Default API base URL with skillSettingId parameter (confirmed working format)
              endpoint = `${API_BASE_URL}?skillSettingId=${agentId}`;
            }
          }

          // Get agent-specific JWT secret
          const agentSecret = process.env[`${agentId.toUpperCase()}_JWT_SECRET`];
          
          // Generate agent-specific token if secret is provided
          const agentToken = agentSecret ? 
            generateAgentToken(agentId, agentSecret) : 
            token;

          // Prepare the request payload
          const payload = {
            question: question,
            chat_history: [], // Empty array as specified in requirements
          };

          console.log(`Sending request to ${endpoint} with payload:`, payload);

          console.log(`Submitting question to agent ${agentId} at endpoint: ${endpoint}`);
          
          // Make the API request
          const response = await axios.post(endpoint, payload, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${agentToken}`,
            },
            timeout: 10000, // 10 seconds timeout
          });
          
          // Log full response for debugging
          console.log(`Full response from ${agentId}:`, JSON.stringify(response.data));

          const responseData = response.data;
          console.log(`Response from ${agentId}:`, responseData);

          // Check response and extract task ID
          if (response.status !== 200 || responseData.statusCode !== "OK") {
            throw new Error(
              `Task creation failed! Response: ${JSON.stringify(responseData)}`
            );
          }

          // Store the taskId and polling interval
          const taskId = responseData.body?.taskId;
          const pollingInterval = responseData.body?.pollingInterval || 2000; // Default to 2 seconds

          if (!taskId) {
            throw new Error("Task ID not found in the response");
          }

          console.log(
            `SUCCESS! Task creation succeeded for ${agentId}! Task ID: ${taskId}, polling interval: ${pollingInterval}ms`
          );
          
          // This log is very important for debugging - we need this exact format
          console.log(`AGENT_TASK_ID: Agent=${agentId}, TaskID=${taskId}, Endpoint=${endpoint}`);

          taskResults[agentId] = {
            taskId: taskId,
            pollingInterval: pollingInterval,
          };
        } catch (error) {
          console.error(`Error submitting question to ${agentId}:`, error);
          taskErrors[agentId] = error.message || "Failed to submit question";
        }
      })
    );

    // If we have no successful tasks, return an error
    if (Object.keys(taskResults).length === 0) {
      return res.status(500).json({
        success: false,
        error: "Failed to submit question to any agents",
        details: taskErrors,
      });
    }

    // Create a master task ID to track all agent tasks
    const masterTaskId = `master_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;

    // Store the task information
    taskStore.set(masterTaskId, {
      tasks: taskResults,
      token: token,
      expiresAt: tokenData.expiresAt,
      question: question,
      agents: agents,
      chatHistoryId: chatHistoryId,
      status: "pending",
      createdAt: Date.now(),
    });

    // For each task, add the endpoint used
    Object.entries(taskResults).forEach(([agentId, task]) => {
      // Get the endpoint used for this agent
      let endpoint = process.env[`${agentId.toUpperCase()}_API_URL`];
      if (!endpoint) {
        endpoint = FALLBACK_AGENT_URLS[agentId] || `${API_BASE_URL}?skillSettingId=${agentId}`;
      }
      task.endpoint = endpoint;
    });
    
    // Return the master task ID and token information
    res.status(200).json({
      success: true,
      taskId: masterTaskId,
      agentTasks: taskResults,
      token: token,
      tokenExpiresAt: tokenData.expiresAt,
      errors: Object.keys(taskErrors).length > 0 ? taskErrors : undefined,
    });
  } catch (error) {
    console.error("Error submitting question:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred",
    });
  }
};

/**
 * Get the response from an agent using the taskId
 */
export const getAgentResponse = async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({
        success: false,
        error: "Task ID is required",
      });
    }

    // Check if this is a master task ID
    if (!taskStore.has(taskId)) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
      });
    }

    // Get the task data
    const taskData = taskStore.get(taskId);
    const { tasks, token, status, question, agents, chatHistoryId } = taskData;

    // If the task is already complete, return the cached result
    if (status === "complete" && taskData.result) {
      return res.status(200).json({
        success: true,
        status: "complete",
        result: taskData.result,
        formattedHtml: taskData.formattedHtml,
        chatHistoryId: taskData.chatHistoryId,
      });
    }

    // Check if token is still valid
    if (!verifyToken(token)) {
      return res.status(401).json({
        success: false,
        error: "Token expired, please try again with a new request",
      });
    }

    // Fetch responses from all agents
    const agentResults = {};
    const pendingAgents = [];

    await Promise.all(
      Object.entries(tasks).map(async ([agentId, agentTask]) => {
        try {
          // Extract task ID and polling interval
          const { taskId: agentTaskId } = agentTask;

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
              
              // Default API base URL with skillSettingId parameter (confirmed working format)
              endpoint = `${API_BASE_URL}?skillSettingId=${agentId}`;
            }
          }

          // Get agent-specific JWT secret
          const agentSecret = process.env[`${agentId.toUpperCase()}_JWT_SECRET`];
          
          // Generate agent-specific token if secret is provided
          const agentToken = agentSecret ? 
            generateAgentToken(agentId, agentSecret) : 
            token;

          // Modify endpoint based on whether it already has a query parameter
          let finalEndpoint;
          if (endpoint.includes('?')) {
            // Add taskId as an additional parameter
            finalEndpoint = `${endpoint}&taskId=${agentTaskId}`;
          } else {
            // Add taskId as the first parameter
            finalEndpoint = `${endpoint}?taskId=${agentTaskId}`;
          }
          
          console.log(`Polling agent ${agentId} with taskId ${agentTaskId} at endpoint: ${finalEndpoint}`);
          
          // Make the API request with direct URL (taskId in URL, not as params)
          const response = await axios.get(finalEndpoint, {
            headers: {
              Authorization: `Bearer ${agentToken}`,
              "Content-Type": "application/json",
            },
            timeout: 10000, // 10 seconds timeout
          });

          const responseData = response.data;
          console.log(`Poll response from ${agentId}:`, responseData);

          // Check status (status 1 = pending, 2,3,4 = complete)
          const status = responseData.body?.status;

          if (status === 1) {
            // Still pending
            pendingAgents.push(agentId);
          } else if (status === 2 || status === 3 || status === 4) {
            // Complete - extract result from response
            const result = responseData.body?.result;
            if (result) {
              agentResults[agentId] = result;
            } else {
              console.error(`No result found in response from ${agentId}`);
              pendingAgents.push(agentId);
            }
          } else {
            console.error(`Unexpected status ${status} from ${agentId}`);
            pendingAgents.push(agentId);
          }
        } catch (error) {
          console.error(`Error getting response from ${agentId}:`, error);
          pendingAgents.push(agentId);
        }
      })
    );

    // If we still have pending agents, return a pending status
    if (pendingAgents.length > 0) {
      return res.status(200).json({
        success: true,
        status: "pending",
        completedAgents: Object.keys(agentResults),
        pendingAgents: pendingAgents,
      });
    }

    // All agents have completed - use the combiner utility
    const { combinedResult, formattedHtml } = combineAgentResponses(
      agentResults,
      agents.map((id) => ({ id, name: getAgentName(id) })),
      question
    );

    // Update task store with the result
    taskStore.set(taskId, {
      ...taskData,
      status: "complete",
      result: combinedResult,
      formattedHtml: formattedHtml,
      completedAt: Date.now(),
    });

    // Save to chat history if provided
    let savedChatHistoryId = chatHistoryId;

    // Always create a chat history for agent responses
    try {
      // Create a title from the question
      const title = question.length > 30 ? 
        `${question.substring(0, 27)}...` : 
        question;
      
      // Create a new chat history document
      const chatHistoryDoc = new chatHistory({
        user: req.user ? req.user._id : null,
        title: title,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await chatHistoryDoc.save();
      savedChatHistoryId = chatHistoryDoc._id;

      // Create a new chat entry
      const chatDoc = new chat({
        chatHistory: chatHistoryDoc._id,
        messages: [
          {
            sender: req.user ? req.user._id : null,
            message: {
              user: question,
              gemini: formattedHtml,
            },
            isSearch: true,
            searchType: "agent", // Use agent type to distinguish from simple search
          },
        ],
      });

      await chatDoc.save();

      // Update chat history reference
      chatHistoryDoc.chat = chatDoc._id;
      await chatHistoryDoc.save();

      // Add to user's chat history if user exists and not already there
      if (req.user && req.user.chatHistory) {
        if (req.user.chatHistory.indexOf(chatHistoryDoc._id) === -1) {
          req.user.chatHistory.push(chatHistoryDoc._id);
          await req.user.save();
        }
      }
    } catch (error) {
      console.error("Error saving to chat history:", error);
      // Continue even if saving fails
    }

    // Return the combined result
    return res.status(200).json({
      success: true,
      status: "complete",
      result: combinedResult,
      formattedHtml: formattedHtml,
      chatHistoryId: savedChatHistoryId,
    });
  } catch (error) {
    console.error("Error getting agent response:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred",
    });
  }
};

/**
 * Get all available agents
 */
export const getAllAgents = (req, res) => {
  try {
    // Return a list of available agents
    const agents = [
      {
        id: "client_agent",
        name: "Client Agent",
        description: "Client-related questions",
      },
      {
        id: "zr_ag",
        name: "ZR Agent",
        description: "Zoom Room questions",
      },
      {
        id: "jira_ag",
        name: "Jira Agent",
        description: "Access and query Jira tickets and projects",
      },
      {
        id: "conf_ag",
        name: "Confluence Agent",
        description: "Search Confluence knowledge base",
      },
      {
        id: "zp_ag",
        name: "ZP Agent",
        description: "Zoom Phone specific support and information",
      },
    ];

    res.status(200).json({
      success: true,
      agents: agents,
    });
  } catch (error) {
    console.error("Error getting agents:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred",
    });
  }
};

/**
 * Helper function to get agent name from ID
 */
function getAgentName(agentId) {
  const agentNames = {
    client_agent: "Client Agent",
    zr_ag: "ZR Agent",
    jira_ag: "Jira Agent",
    conf_ag: "Confluence Agent", 
    zp_ag: "ZP Agent",
  };

  return agentNames[agentId] || agentId;
}
