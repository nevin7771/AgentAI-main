// server/controller/agent_api.js
import { createAgent, DeepResearchAgent } from "../agents/index.js";
import { chat } from "../model/chat.js";
import { chatHistory } from "../model/chatHistory.js";
import { user } from "../model/user.js";
import { formatAgentResponse } from "../utils/agentResponseCombiner.js";
import { generateJwtToken } from "../service/jwt_service.js";

// Helper function to get or create a default user for non-authenticated requests
const getDefaultUser = async () => {
  try {
    // Look for an existing default user
    let defaultUser = await user.findOne({ email: 'default@agent.ai' });
    
    // If no default user exists, create one
    if (!defaultUser) {
      defaultUser = new user({
        name: 'Default User',
        email: 'default@agent.ai',
        location: 'System',
        maxRateLimit: 100, // Higher limit for system user
      });
      await defaultUser.save();
      console.log('Created default user for non-authenticated requests');
    }
    
    return defaultUser._id;
  } catch (error) {
    console.error('Error getting/creating default user:', error);
    throw error;
  }
};

// Generate JWT token for agent API authentication
export const generateToken = async (req, res) => {
  try {
    const { agentId } = req.body;
    
    // Generate JWT token
    const tokenData = generateJwtToken(agentId || "default");
    
    return res.status(200).json({
      success: true,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt
    });
  } catch (error) {
    console.error("Error generating token:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating token",
      error: error.message
    });
  }
};

// Handle agent question submission
export const submitQuestion = async (req, res) => {
  try {
    const { question, agents, chatHistoryId } = req.body;
    
    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Question is required"
      });
    }
    
    if (!agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one agent must be specified"
      });
    }
    
    // Create task IDs for each agent
    const agentTasks = {};
    const now = Date.now();
    
    agents.forEach(agentId => {
      // Generate unique task ID for this agent
      const taskId = `${agentId}_${now}_${Math.random().toString(36).substring(2, 9)}`;
      
      // Generate token for this agent
      const tokenData = generateJwtToken(agentId);
      
      // Store task details
      agentTasks[agentId] = {
        taskId,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
        question
      };
    });
    
    return res.status(200).json({
      success: true,
      message: "Question submitted successfully",
      question,
      chatHistoryId,
      agentTasks,
      // For compatibility with older code, also return the first agent's info at top level
      taskId: agentTasks[agents[0]].taskId,
      token: agentTasks[agents[0]].token
    });
  } catch (error) {
    console.error("Error submitting question:", error);
    return res.status(500).json({
      success: false,
      message: "Error submitting question",
      error: error.message
    });
  }
};

// Get response from agent
export const getAgentResponse = async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Task ID is required"
      });
    }
    
    // Get agent ID from task ID (format: agentId_timestamp_random)
    const agentId = taskId.split('_')[0];
    
    // For now, use local agent implementation instead of external API
    const agent = new DeepResearchAgent();
    
    // Process a placeholder query
    const result = await agent.processQuery(`Task ${taskId} for agent ${agentId}`);
    
    return res.status(200).json({
      success: true,
      result: {
        answer: "This is a simulated response. In a real implementation, this would fetch the result from the agent API.",
        sources: result.sources || []
      }
    });
  } catch (error) {
    console.error("Error getting agent response:", error);
    return res.status(500).json({
      success: false,
      message: "Error getting agent response",
      error: error.message
    });
  }
};

// Get available agents
export const getAllAgents = async (req, res) => {
  try {
    // Hardcoded list of available agents
    const agents = [
      { id: "conf_ag", name: "Confluence Agent", description: "Search and analyze Confluence pages" },
      { id: "jira_ag", name: "Jira Agent", description: "Search and analyze Jira issues" },
      { id: "client_agent", name: "Client Agent", description: "Client-specific research" },
      { id: "zr_ag", name: "ZR Agent", description: "Zoom Resources Agent" },
      { id: "zp_ag", name: "ZP Agent", description: "Zoom Portal Agent" },
      { id: "local", name: "Local Agent", description: "Local agent implementation" }
    ];
    
    return res.status(200).json({
      success: true,
      agents
    });
  } catch (error) {
    console.error("Error getting available agents:", error);
    return res.status(500).json({
      success: false,
      message: "Error getting available agents",
      error: error.message
    });
  }
};

// Unified agent API handler
export const handleAgentRequest = async (req, res) => {
  const { question, agentType, chatHistoryId, conversationHistory = [] } = req.body;

  if (!question) {
    return res.status(400).json({
      success: false,
      message: "No question provided"
    });
  }

  try {
    console.log(`Processing ${agentType || 'default'} agent request: "${question}"`);

    // Get the appropriate agent based on type
    let selectedAgent;
    let agentDisplayName;
    
    try {
      if (agentType === 'deepResearch') {
        selectedAgent = new DeepResearchAgent();
        agentDisplayName = 'Deep Research Agent';
      } else {
        // Default to a general search agent if other types don't exist yet
        selectedAgent = new DeepResearchAgent();
        agentDisplayName = 'AI Search Agent';
      }
    } catch (error) {
      console.error(`Error creating agent of type ${agentType}:`, error);
      // Fallback to a simple agent that can handle the request
      selectedAgent = {
        processQuery: async (query) => ({
          answer: `I processed your query "${query}" but encountered an issue creating the specialized agent. Here's a general response.`,
          sources: []
        })
      };
      agentDisplayName = 'Fallback Agent';
    }

    // Start the agent processing call
    console.log(`Using agent: ${agentDisplayName}`);
    const agentResponse = await selectedAgent.processQuery(question, conversationHistory);
    
    // Format the HTML response
    const formattedHtml = formatAgentResponse(agentResponse, agentDisplayName);

    // Save to chat history if provided
    let savedChatHistoryId = chatHistoryId;

    // Always create a chat history for agent responses
    try {
      // Create a title from the question
      const title = question.length > 30 ? 
        `${question.substring(0, 27)}...` : 
        question;
      
      // Create a new chat history document
      // Get default user ID if not authenticated
      const defaultUserId = await getDefaultUser();
      
      // Check if we have a client-generated ID in the chatHistoryId
      const clientId = chatHistoryId && chatHistoryId.includes('_') ? chatHistoryId : `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      const chatHistoryDoc = new chatHistory({
        user: req.user ? req.user._id : defaultUserId,
        title: title,
        timestamp: new Date(),
        clientId: clientId, // Store the client ID for lookups
        type: 'agent'
      });
      
      await chatHistoryDoc.save();
      savedChatHistoryId = chatHistoryDoc._id;

      // Create a new chat entry
      const chatDoc = new chat({
        chatHistory: chatHistoryDoc._id,
        messages: [
          {
            sender: req.user ? req.user._id : defaultUserId,
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
      data: {
        answer: formattedHtml,
        sources: agentResponse.sources || [],
        metadata: agentResponse.metadata || {},
        chatHistoryId: savedChatHistoryId
      }
    });
  } catch (error) {
    console.error("Error processing agent request:", error);
    return res.status(500).json({
      success: false,
      message: "Error processing your request",
      error: error.message
    });
  }
};

// Test endpoint
export const testAgentConnection = async (req, res) => {
  try {
    // Test connection to the agent
    return res.json({
      success: true,
      message: "Agent API connection successful"
    });
  } catch (error) {
    console.error("Error testing agent connection:", error);
    return res.status(500).json({
      success: false,
      message: "Error connecting to agent API",
      error: error.message
    });
  }
};

// Proxy endpoint
export const proxyAgentRequest = async (req, res) => {
  try {
    // Process the request using the agent API
    const response = await handleAgentRequest(req, res);
    return response;
  } catch (error) {
    console.error("Error in agent proxy:", error);
    return res.status(500).json({
      success: false,
      message: "Error in agent proxy",
      error: error.message
    });
  }
};