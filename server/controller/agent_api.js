// server/controller/agent_api.js
import { generateJwtToken, verifyToken } from "../service/jwt_service.js";
import axios from "axios";
import { chat } from "../model/chat.js";
import { chatHistory } from "../model/chatHistory.js";

// Base URL for the external agent API - matching the Python script
const API_BASE_URL =
  "https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw";

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

    // Generate a fresh token
    const tokenData = generateJwtToken();
    const token = tokenData.token;

    // Create the chat history
    const taskResults = {};
    const taskErrors = {};

    // Process each agent in parallel
    await Promise.all(
      agents.map(async (agentId) => {
        try {
          // Construct agent-specific endpoint - format matches Python script
          const endpoint = `${API_BASE_URL}/${agentId}`;

          // Prepare the request payload - matching the Python script format
          const payload = {
            question: question,
            chat_history: [], // Empty array as specified
          };

          console.log(`Sending request to ${endpoint} with payload:`, payload);

          // Make the API request - matching Python script
          const response = await axios.post(endpoint, payload, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            timeout: 10000, // 10 seconds timeout
          });

          const responseData = response.data;
          console.log(`Response from ${agentId}:`, responseData);

          // Check response and extract task ID - matching Python script response structure
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
            `Task creation succeeded for ${agentId}! Task ID: ${taskId}, polling interval: ${pollingInterval}ms`
          );

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

    // Return the master task ID
    res.status(200).json({
      success: true,
      taskId: masterTaskId,
      agentTasks: taskResults,
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
      });
    }

    // Fetch responses from all agents
    const agentResults = {};
    const pendingAgents = [];

    await Promise.all(
      Object.entries(tasks).map(async ([agentId, agentTask]) => {
        try {
          // Extract task ID and polling interval
          const { taskId: agentTaskId, pollingInterval } = agentTask;

          // Construct agent-specific endpoint for getting results - matching Python script
          const endpoint = `${API_BASE_URL}/${agentId}`;

          // Make the API request with query parameter - matching Python script
          const response = await axios.get(endpoint, {
            params: {
              taskId: agentTaskId,
            },
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            timeout: 10000, // 10 seconds timeout
          });

          const responseData = response.data;
          console.log(`Poll response from ${agentId}:`, responseData);

          // Check status according to Python script (status 1 = pending, 2,3,4 = complete)
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

    // All agents have completed - combine results
    const combinedResult = combineAgentResults(agentResults, agents);

    // Format the HTML response - use the same format as simple search
    const formattedHtml = formatSimpleSearchResponse(
      question,
      combinedResult,
      agents
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
    if (chatHistoryId && req.user) {
      try {
        // Find or create chat history
        let chatHistoryDoc = await chatHistory.findById(chatHistoryId);

        if (!chatHistoryDoc) {
          chatHistoryDoc = new chatHistory({
            user: req.user._id,
            title: question.substring(0, 30),
          });
          await chatHistoryDoc.save();
        }

        // Create a new chat entry
        const chatDoc = new chat({
          chatHistory: chatHistoryDoc._id,
          messages: [
            {
              sender: req.user._id,
              message: {
                user: question,
                gemini: formattedHtml,
              },
              isSearch: true,
              searchType: "simple", // Use simple search type as requested
            },
          ],
        });

        await chatDoc.save();

        // Update chat history reference
        chatHistoryDoc.chat = chatDoc._id;
        await chatHistoryDoc.save();

        // Add to user's chat history if not already there
        if (req.user.chatHistory.indexOf(chatHistoryDoc._id) === -1) {
          req.user.chatHistory.push(chatHistoryDoc._id);
          await req.user.save();
        }
      } catch (error) {
        console.error("Error saving to chat history:", error);
        // Continue even if saving fails
      }
    }

    // Return the combined result
    return res.status(200).json({
      success: true,
      status: "complete",
      result: combinedResult,
      formattedHtml: formattedHtml,
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
    // For now, return a static list of agents
    // In a production environment, you might fetch this from a database or API
    const agents = [
      {
        id: "MRlQT_lhFw", // Using the ID from the Python script
        name: "Client Agent",
        description: "Answers questions about client products and services",
      },
      {
        id: "zr_ag",
        name: "ZR Agent",
        description: "Zoom Room agent for hardware and deployment questions",
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
 * Helper function to combine results from multiple agents
 */
function combineAgentResults(agentResults, agents) {
  // Simple aggregation of results
  const combinedResults = {};

  for (const agentId in agentResults) {
    const agentName = agents.find((a) => a.id === agentId)?.name || agentId;
    combinedResults[agentName] = agentResults[agentId];
  }

  return combinedResults;
}

/**
 * Format agent response as HTML - matching the simple search format
 */
function formatSimpleSearchResponse(query, results, agents) {
  // Start with the basic container
  let html = `
    <div class="simple-search-results">
      <h3>Search Results</h3>
      <p><strong>Query:</strong> "${query}"</p>
      
      <div class="simple-search-content">
  `;

  // Add each agent's result
  for (const agentName in results) {
    html += `
      <div class="agent-result">
        <h4>${agentName}</h4>
        <div class="agent-answer">
          ${results[agentName]}
        </div>
      </div>
    `;
  }

  // Close the container
  html += `
      </div>
      
      <div class="simple-search-note">
        <p><small>This response was generated by multiple AI agents based on your query.</small></p>
      </div>
    </div>
  `;

  return html;
}
