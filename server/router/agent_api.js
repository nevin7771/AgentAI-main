// server/router/agent_api.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  generateToken,
  submitQuestion,
  getAgentResponse,
  getAllAgents,
} from "../controller/agent_api.js";
import { proxyAgentPoll } from "../controller/agent_api_proxy.js";
import { testAgentConfig } from "../controller/agent_api_test.js";

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
    
    // Create chat history document - use IP user if no authenticated user
    const chatHistoryDoc = new chatHistory({
      // The req.user will come from either JWT auth or IP-based auth
      user: req.user ? req.user._id : null,
      title: title.substring(0, 50),
      type: searchType || "agent"
    });
    
    console.log("Creating chat history document:", {
      user: req.user ? req.user._id : "No user",
      title: title.substring(0, 50),
      type: searchType || "agent"
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