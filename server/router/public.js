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
router.post("/api/deepsearch", deepSearchHandler);

// Routes with /gemini prefix for backward compatibility
// When app.js uses /gemini as base, these will resolve as /gemini/api/...
router.get("/api/getsinglechat/:id", authMiddleware, getSingleChat);
router.post("/api/chat", authMiddleware, rateLimit, postGemini);
router.get("/api/getchathistory", authMiddleware, getChatHistory);

router.post("/api/search-with-ai", searchWithAIHandler);
router.post("/api/agent", agentHandler);

export default router;
