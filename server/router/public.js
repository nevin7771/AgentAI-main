import express from "express";

const router = express.Router();

import {
  getGeminiHome,
  postGemini,
  getChatHistory,
  postChat,
  updateLocation,
  createChatHistory,
} from "../controller/public.js";
import {
  deepSearchHandler,
  searchWithAIHandler,
  agentHandler,
} from "../controller/agent.js";

import { authMiddleware } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

router.get("/api", getGeminiHome);
router.post("/api/chat", authMiddleware, rateLimit, postGemini);
router.get("/api/getchathistory", authMiddleware, getChatHistory);
router.post("/api/chatdata", authMiddleware, postChat);
router.put("/api/updatelocation", authMiddleware, updateLocation);
router.post("/api/create-chat-history", authMiddleware, createChatHistory);
router.post("/api/deepsearch", deepSearchHandler);

router.post("/api/search-with-ai", searchWithAIHandler);
router.post("/api/agent", agentHandler);

export default router;
