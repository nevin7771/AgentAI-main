// server/router/agent_api.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  handleAgentRequest,
  testAgentConnection,
  proxyAgentRequest,
  generateToken,
  submitQuestion,
  getAgentResponse,
  getAllAgents
} from "../controller/agent_api.js";
import { proxyAgentPoll } from "../controller/agent_api_proxy.js";
import { testAgentConfig } from "../controller/agent_api_test.js";
import { chatHistory } from "../model/chatHistory.js";
import { chat } from "../model/chat.js";

const router = express.Router();

// Add a ping endpoint to test connectivity
router.get("/api/ping", (req, res) => {
  console.log("Ping request received");
  res.status(200).json({
    success: true,
    message: "Server is reachable",
    timestamp: new Date().toISOString()
  });
});

// Add a special endpoint for looking up agent chat history
router.post("/api/agent-chat-lookup", async (req, res) => {
  try {
    const { chatHistoryId } = req.body;
    
    if (!chatHistoryId) {
      return res.status(400).json({
        success: false,
        error: "Chat history ID is required"
      });
    }
    
    console.log(`[AgentChatLookup] Looking for chat history: ${chatHistoryId}`);
    
    // Try different ways to find the chat
    let chatDoc;
    
    // Check if it's a client-generated ID (agent_timestamp_xyz format)
    const isClientId = chatHistoryId && chatHistoryId.includes('_');
    
    if (isClientId) {
      // First try by clientId field
      chatDoc = await chatHistory.findOne({ clientId: chatHistoryId }).populate('chat');
      
      if (!chatDoc) {
        // Then try by title match
        chatDoc = await chatHistory.findOne({ 
          title: { $regex: chatHistoryId.replace(/_/g, '.*'), $options: 'i' } 
        }).populate('chat');
      }
    } else {
      // Try by MongoDB ID
      try {
        chatDoc = await chatHistory.findById(chatHistoryId).populate('chat');
      } catch (idError) {
        console.log("Invalid MongoDB ID format:", idError.message);
      }
    }
    
    if (!chatDoc) {
      return res.status(404).json({
        success: false,
        error: "Chat history not found"
      });
    }
    
    console.log(`[AgentChatLookup] Found chat history: ${chatDoc._id}, with clientId: ${chatDoc.clientId}`);
    
    // Return the chat data
    return res.status(200).json({
      success: true,
      chatHistory: chatDoc._id,
      clientId: chatDoc.clientId,
      title: chatDoc.title,
      chats: chatDoc.chat?.messages || []
    });
  } catch (error) {
    console.error("[AgentChatLookup] Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "An unknown error occurred"
    });
  }
});

// Create chat history route definition - before auth middleware
// so it won't require authentication
const createChatHistoryHandler = async (req, res) => {
  try {
    const { title, message, isSearch, searchType } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: "Title and message are required"
      });
    }
    
    // Check if user is present in the request
    console.log("User ID from request:", req.user ? req.user._id : "No user");
    
    // Always allow chat history creation regardless of authentication
    // If no user is present, we'll still create the records in MongoDB

    // Create chat history in MongoDB whether user is authenticated or not
    const { chatHistory } = await import("../model/chatHistory.js");
    const { chat } = await import("../model/chat.js");
    const { user } = await import("../model/user.js");
    
    // Generate a client ID if this is an agent search
    const clientId = searchType === "agent" 
      ? `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
      : `${searchType || "chat"}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Create chat history document - use IP user if no authenticated user
    const chatHistoryDoc = new chatHistory({
      // The req.user will come from either JWT auth or IP-based auth
      user: req.user ? req.user._id : null,
      title: title.substring(0, 50),
      type: searchType || "agent",
      clientId // Store the client ID for lookups
    });
    
    console.log("Creating chat history document:", {
      user: req.user ? req.user._id : "No user",
      title: title.substring(0, 50),
      type: searchType || "agent",
      clientId
    });
    
    await chatHistoryDoc.save();
    
    // Create chat document with messages
    const chatDoc = new chat({
      chatHistory: chatHistoryDoc._id,
      messages: [
        {
          sender: req.user ? req.user._id : null,
          message: {
            user: message.user,
            gemini: message.gemini
          },
          isSearch: isSearch !== undefined ? isSearch : true,
          searchType: searchType || "agent"
        }
      ]
    });
    
    await chatDoc.save();
    
    // Update chat history with reference to chat
    chatHistoryDoc.chat = chatDoc._id;
    await chatHistoryDoc.save();
    
    // Update user document with reference to chat history if we have a user
    if (req.user && req.user._id) {
      const userData = await user.findById(req.user._id);
      if (userData) {
        userData.chatHistory.push(chatHistoryDoc._id);
        await userData.save();
      }
    }
    
    console.log("Successfully created chat history with ID:", chatHistoryDoc._id);
    
    res.status(200).json({
      success: true,
      chatHistoryId: chatHistoryDoc._id,
      clientId: clientId,
      message: "Chat history created successfully"
    });
    
  } catch (error) {
    console.error("Error creating chat history:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred creating chat history"
    });
  }
};

// Route to create chat history - MUST be registered BEFORE auth middleware
router.post("/api/create-chat-history", createChatHistoryHandler);

// Proxy endpoint to avoid CORS issues (also before auth middleware)
router.post("/api/proxy-agent-poll", proxyAgentPoll);

// Apply auth middleware to all other routes
router.use(authMiddleware);

// Route to test connection to the agent
router.get("/api/test-agent", testAgentConnection);

// Route to handle agent requests directly
router.post("/api/agent-request", handleAgentRequest);

// Route to proxy agent requests
router.post("/api/agent-proxy", proxyAgentRequest);

// Route to generate a JWT token
router.post("/api/generate-jwt", generateToken);

// Route to submit a question to an agent
router.post("/api/agent-question", submitQuestion);

// Route to get the response from an agent
router.get("/api/agent-response/:taskId", getAgentResponse);

// Route to get all available agents
router.get("/api/available-agents", getAllAgents);

// Test agent configuration
router.post("/api/test-agent-config", testAgentConfig);


export default router;