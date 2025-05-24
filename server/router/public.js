import express from "express";

const router = express.Router();

import {
  getGeminiHome,
  postGemini,
  getChatHistory,
  postChat,
  updateLocation,
  createChatHistory,
  getSingleChat,
  deleteChatHistoryController, // Import the new controller
  updateChatHistory,
  createChatHistoryEnhanced,
} from "../controller/public.js";
import {
  deepSearchHandler,
  searchWithAIHandler,
  agentHandler,
} from "../controller/agent.js";

import { authMiddleware } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

// Base API routes
router.get("/api", getGeminiHome);
router.post("/api/chat", authMiddleware, rateLimit, postGemini);
router.get("/api/getchathistory", authMiddleware, getChatHistory);
router.post("/api/chatdata", authMiddleware, postChat);
router.get("/api/getsinglechat/:id", authMiddleware, getSingleChat);
router.put("/api/updatelocation", authMiddleware, updateLocation);
router.post("/api/create-chat-history", authMiddleware, createChatHistory);
router.put("/api/update-chat-history", updateChatHistory);
router.post("/api/create-chat-history-enhanced", createChatHistoryEnhanced);
router.delete(
  "/api/deletechathistory",
  authMiddleware,
  deleteChatHistoryController
); // Added this line for the correct API path
router.post("/api/deepsearch", deepSearchHandler);

// Routes with /gemini prefix for backward compatibility
// When app.js uses /gemini as base, these will resolve as /gemini/api/...
router.get("/gemini/api/getsinglechat/:id", authMiddleware, getSingleChat); // Corrected path for consistency
router.post("/gemini/api/chat", authMiddleware, rateLimit, postGemini);
router.get("/gemini/api/getchathistory", authMiddleware, getChatHistory);
router.delete(
  "/gemini/api/deletechathistory",
  authMiddleware,
  deleteChatHistoryController
); // Existing delete route with /gemini prefix

router.post("/gemini/api/search-with-ai", searchWithAIHandler); // Corrected path for consistency
router.post("/gemini/api/agent", agentHandler); // Corrected path for consistency

export default router;
