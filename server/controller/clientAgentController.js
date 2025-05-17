import express from "express";
import ClientAgent from "../agents/clientAgent.js"; // Added .js extension for ESM

const router = express.Router();

// In-memory store for active ClientAgent sessions (for prototype)
// For production, use a more persistent store like Redis or a database
const activeSessions = {};

// Middleware to get or create a session
const getSession = (req, res, next) => {
  let sessionId = req.params.sessionId || req.body.sessionId;
  const userId = req.body.userId || "defaultUser"; // Or from auth middleware

  if (!sessionId) {
    // Create a new session if no ID is provided (e.g., for starting a new chat)
    sessionId = `session_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 15)}`;
    console.log(`No sessionId provided, creating new session: ${sessionId}`);
  }

  if (!activeSessions[sessionId]) {
    console.log(`Creating new ClientAgent for session: ${sessionId}`);
    activeSessions[sessionId] = new ClientAgent(sessionId, userId);
  } else {
    console.log(`Using existing ClientAgent for session: ${sessionId}`);
  }
  req.clientAgent = activeSessions[sessionId];
  req.sessionId = sessionId; // Ensure sessionId is attached to req for later use
  next();
};

// POST /api/client-agent/session - Start a new troubleshooting session
router.post("/session", getSession, (req, res) => {
  // The getSession middleware already creates the session if it doesn't exist.
  // We can return the session ID and an initial greeting or status.
  const initialMessage = "New session started. How can I help you today?";
  req.clientAgent.state.conversationHistory.push({
    turn: "agent",
    message: initialMessage,
    timestamp: new Date(),
  });
  res.status(200).json({
    sessionId: req.sessionId,
    message: initialMessage,
    currentState: req.clientAgent.getState(),
  });
});

// POST /api/client-agent/session/:sessionId/message - Send a user message to an active session
router.post("/session/:sessionId/message", getSession, async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message content is required." });
  }

  try {
    const agentResponse = await req.clientAgent.handleMessage(message);
    res.status(200).json({
      sessionId: req.sessionId,
      response: agentResponse.response,
      suggestedFollowUps: agentResponse.suggestedFollowUps, // Will be null if not generated
      currentState: req.clientAgent.getState(),
    });
  } catch (error) {
    console.error(
      `Error in /message endpoint for session ${req.sessionId}:`,
      error
    );
    res
      .status(500)
      .json({ error: "Failed to process message.", details: error.message });
  }
});

// GET /api/client-agent/session/:sessionId/state - Get the current state of a session (for debugging/dev)
router.get("/session/:sessionId/state", getSession, (req, res) => {
  res.status(200).json({
    sessionId: req.sessionId,
    currentState: req.clientAgent.getState(),
  });
});

export default router;
