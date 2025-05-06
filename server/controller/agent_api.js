// server/controller/agent_api.js

import { createAgent, DeepResearchAgent } from "../agents/index.js";
import { chat } from "../model/chat.js";
import { chatHistory } from "../model/chatHistory.js";
import { user } from "../model/user.js";
import { formatAgentResponse } from "../utils/agentResponseCombiner.js";
import { generateJwtToken } from "../service/jwt_service.js";
import OrchestrationService from "../orchestration/OrchestrationService.js";

// --- Helper: Default user ---
const getDefaultUser = async () => {
  try {
    let defaultUser = await user.findOne({ email: "default@agent.ai" });
    if (!defaultUser) {
      defaultUser = new user({
        name: "Default User",
        email: "default@agent.ai",
        location: "System",
        maxRateLimit: 100,
      });
      await defaultUser.save();
    }
    return defaultUser._id;
  } catch (error) {
    console.error("Error getting/creating default user:", error);
    throw error;
  }
};

// --- JWT Token ---
export const generateToken = async (req, res) => {
  try {
    const { agentId } = req.body;
    const tokenData = generateJwtToken(agentId || "default");
    return res.status(200).json({
      success: true,
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
    });
  } catch (error) {
    console.error("Error generating token:", error);
    return res.status(500).json({
      success: false,
      message: "Error generating token",
      error: error.message,
    });
  }
};

// --- Submit Question ---
export const submitQuestion = async (req, res) => {
  try {
    const { question, agents, chatHistoryId } = req.body;
    if (!question || !agents || !Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid input" });
    }

    const agentTasks = {};
    const now = Date.now();

    agents.forEach((agentId) => {
      const taskId = `${agentId}_${now}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      const tokenData = generateJwtToken(agentId);
      agentTasks[agentId] = {
        taskId,
        token: tokenData.token,
        expiresAt: tokenData.expiresAt,
        question,
      };
    });

    return res.status(200).json({
      success: true,
      question,
      chatHistoryId,
      agentTasks,
      taskId: agentTasks[agents[0]].taskId,
      token: agentTasks[agents[0]].token,
    });
  } catch (error) {
    console.error("Error submitting question:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error", error: error.message });
  }
};

// --- Agent Response (Mock) ---
export const getAgentResponse = async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!taskId)
      return res
        .status(400)
        .json({ success: false, message: "Task ID required" });

    const agentId = taskId.split("_")[0];
    const agent = new DeepResearchAgent();
    const result = await agent.processQuery(
      `Task ${taskId} for agent ${agentId}`
    );

    return res.status(200).json({
      success: true,
      result: {
        answer: "This is a simulated response.",
        sources: result.sources || [],
      },
    });
  } catch (error) {
    console.error("Error getting agent response:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error", error: error.message });
  }
};

// --- Get All Agents ---
export const getAllAgents = async (req, res) => {
  try {
    const agents = [
      {
        id: "conf_ag",
        name: "Confluence Agent",
        description: "Search and analyze Confluence pages",
      },
      {
        id: "jira_ag",
        name: "Jira Agent",
        description: "Search and analyze Jira issues",
      },
      {
        id: "client_agent",
        name: "Client Agent",
        description: "Client-specific research",
      },
      { id: "zr_ag", name: "ZR Agent", description: "Zoom Resources Agent" },
      { id: "zp_ag", name: "ZP Agent", description: "Zoom Portal Agent" },
      {
        id: "local",
        name: "Local Agent",
        description: "Local agent implementation",
      },
    ];
    return res.status(200).json({ success: true, agents });
  } catch (error) {
    console.error("Error getting available agents:", error);
    return res
      .status(500)
      .json({ success: false, message: "Error", error: error.message });
  }
};

// --- Orchestrated Query Handler ---
export const handleOrchestratedQuery = async (req, res) => {
  try {
    const { query, chatHistory = [], options = {} } = req.body;
    const logFilePath = null; // Hook for multer later

    if (!query) {
      return res
        .status(400)
        .json({ success: false, error: "Query is required." });
    }

    console.log(`[Controller] Orchestrated query: "${query}"`);
    const result = await OrchestrationService.handleQuery(
      query,
      chatHistory,
      options,
      logFilePath
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error("[Controller] Orchestration error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred.",
    });
  }
};

// --- Unified Agent Handler ---
export const handleAgentRequest = async (req, res) => {
  const {
    question,
    agentType,
    chatHistoryId,
    conversationHistory = [],
  } = req.body;

  if (!question) {
    return res
      .status(400)
      .json({ success: false, message: "No question provided" });
  }

  try {
    console.log(
      `Processing ${agentType || "default"} agent request: "${question}"`
    );
    let selectedAgent, agentDisplayName;

    try {
      if (agentType === "deepResearch") {
        selectedAgent = new DeepResearchAgent();
        agentDisplayName = "Deep Research Agent";
      } else {
        selectedAgent = new DeepResearchAgent();
        agentDisplayName = "AI Search Agent";
      }
    } catch (error) {
      console.error(`Agent fallback triggered for type ${agentType}:`, error);
      selectedAgent = {
        processQuery: async (query) => ({
          answer: `Fallback agent response for "${query}".`,
          sources: [],
        }),
      };
      agentDisplayName = "Fallback Agent";
    }

    const agentResponse = await selectedAgent.processQuery(
      question,
      conversationHistory
    );
    const formattedHtml = formatAgentResponse(agentResponse, agentDisplayName);
    let savedChatHistoryId = chatHistoryId;

    try {
      const title =
        question.length > 30 ? `${question.substring(0, 27)}...` : question;
      const defaultUserId = await getDefaultUser();
      const clientId =
        chatHistoryId && chatHistoryId.includes("_")
          ? chatHistoryId
          : `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const chatHistoryDoc = new chatHistory({
        user: req.user ? req.user._id : defaultUserId,
        title,
        timestamp: new Date(),
        clientId,
        type: "agent",
      });

      await chatHistoryDoc.save();
      savedChatHistoryId = chatHistoryDoc._id;

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
            searchType: "agent",
          },
        ],
      });

      await chatDoc.save();
      chatHistoryDoc.chat = chatDoc._id;
      await chatHistoryDoc.save();

      if (
        req.user &&
        req.user.chatHistory?.indexOf(chatHistoryDoc._id) === -1
      ) {
        req.user.chatHistory.push(chatHistoryDoc._id);
        await req.user.save();
      }
    } catch (error) {
      console.error("Failed to persist chat history:", error);
    }

    return res.status(200).json({
      success: true,
      status: "complete",
      data: {
        answer: formattedHtml,
        sources: agentResponse.sources || [],
        metadata: agentResponse.metadata || {},
        chatHistoryId: savedChatHistoryId,
      },
    });
  } catch (error) {
    console.error("Error processing agent request:", error);
    return res.status(500).json({
      success: false,
      message: "Error processing your request",
      error: error.message,
    });
  }
};

// --- Test Endpoint ---
export const testAgentConnection = async (req, res) => {
  try {
    return res.json({
      success: true,
      message: "Agent API connection successful",
    });
  } catch (error) {
    console.error("Test error:", error);
    return res.status(500).json({
      success: false,
      message: "Connection failed",
      error: error.message,
    });
  }
};

// --- Proxy Endpoint ---
export const proxyAgentRequest = async (req, res) => {
  try {
    return await handleAgentRequest(req, res);
  } catch (error) {
    console.error("Proxy error:", error);
    return res.status(500).json({
      success: false,
      message: "Error in proxy",
      error: error.message,
    });
  }
};
