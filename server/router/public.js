// server/router/public.js - ADD NEW API ENDPOINT
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
  deleteChatHistoryController,
  updateChatHistory,
  createChatHistoryEnhanced,
  appendChatMessage, // CRITICAL FIX: Import new function
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
router.post("/api/append-chat-message", appendChatMessage); // CRITICAL FIX: Add new endpoint
router.delete(
  "/api/deletechathistory",
  authMiddleware,
  deleteChatHistoryController
);
router.post("/api/deepsearch", deepSearchHandler);

// Routes with /gemini prefix for backward compatibility
router.get("/gemini/api/getsinglechat/:id", authMiddleware, getSingleChat);
router.post("/gemini/api/chat", authMiddleware, rateLimit, postGemini);
router.get("/gemini/api/getchathistory", authMiddleware, getChatHistory);
router.delete(
  "/gemini/api/deletechathistory",
  authMiddleware,
  deleteChatHistoryController
);

router.post("/gemini/api/search-with-ai", searchWithAIHandler);
router.post("/gemini/api/agent", agentHandler);

export default router;
