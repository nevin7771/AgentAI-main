// server/router/agent_api.js
import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import {
  generateToken,
  submitQuestion,
  getAgentResponse,
  getAllAgents,
} from "../controller/agent_api.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Route to generate a JWT token
router.post("/api/generate-jwt", generateToken);

// Route to submit a question to an agent
router.post("/api/agent-question", submitQuestion);

// Route to get the response from an agent
router.get("/api/agent-response/:taskId", getAgentResponse);

// Route to get all available agents
router.get("/api/available-agents", getAllAgents);

export default router;
