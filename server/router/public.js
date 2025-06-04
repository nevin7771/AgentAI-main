// server/router/public.js - COMPLETE WITH ALL MISSING ROUTES AND ENHANCED LOGGING
import express from "express";
import fs from "fs";
import path from "path";

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
  appendChatMessage,
  // ADD THESE NEW IMPORTS
  getAvailableAgents,
  generateJwtToken,
} from "../controller/public.js";
import {
  deepSearchHandler,
  searchWithAIHandler,
  agentHandler,
} from "../controller/agent.js";

import { authMiddleware } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

// ENHANCED LOGGING SYSTEM
// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Enhanced logging function for feedback and errors
const logToFile = (type, data) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type,
    ...data,
  };

  const logFile = path.join(
    logsDir,
    `${type}-${new Date().toISOString().split("T")[0]}.log`
  );
  const logLine = JSON.stringify(logEntry) + "\n";

  try {
    fs.appendFileSync(logFile, logLine);
    console.log(`📝 [Logger] ${type.toUpperCase()} logged to file: ${logFile}`);
  } catch (error) {
    console.error(`❌ [Logger] Failed to write ${type} log:`, error);
  }
};

// Enhanced auth middleware for debugging
const debugAuth = (req, res, next) => {
  console.log(`[Route Debug] ${req.method} ${req.path}`);
  console.log(`[Route Debug] User: ${req.user ? req.user._id : "No user"}`);
  console.log(`[Route Debug] Auth: ${req.auth || "No auth"}`);
  console.log(
    `[Route Debug] Body:`,
    req.body ? JSON.stringify(req.body).substring(0, 200) : "No body"
  );
  next();
};

// CRITICAL FIX: Enhanced auth middleware for chat operations
const requireAuth = (req, res, next) => {
  console.log(`[RequireAuth] Checking auth for ${req.method} ${req.path}`);
  console.log(`[RequireAuth] User exists: ${!!req.user}`);
  console.log(`[RequireAuth] User ID: ${req.user?._id}`);

  if (!req.user || !req.user._id) {
    console.warn(
      `[RequireAuth] BLOCKED - No authenticated user for ${req.path}`
    );
    return res.status(401).json({
      success: false,
      error: "Authentication required",
      message: "Please log in to access this feature",
      debug: {
        hasUser: !!req.user,
        userId: req.user?._id,
        authType: req.auth,
        path: req.path,
      },
    });
  }

  console.log(
    `[RequireAuth] ALLOWED - User ${req.user._id} accessing ${req.path}`
  );
  next();
};

// Base API routes
router.get("/api", getGeminiHome);

// CRITICAL FIX: ADD THE MISSING ROUTES THAT FRONTEND IS CALLING
console.log("[Routes] Setting up missing API routes...");

// Add the missing /api/available-agents route
router.get(
  "/api/available-agents",
  authMiddleware,
  debugAuth,
  getAvailableAgents
);

// Add the missing /api/generate-jwt route
router.post("/api/generate-jwt", authMiddleware, debugAuth, generateJwtToken);

// CRITICAL FIX: Ensure all chat routes are properly set up with debugging
console.log("[Routes] Setting up chat routes...");

// Chat history and data routes - MOST IMPORTANT
router.post(
  "/api/chat",
  authMiddleware,
  debugAuth,
  requireAuth,
  rateLimit,
  postGemini
);
router.get(
  "/api/getchathistory",
  authMiddleware,
  debugAuth,
  requireAuth,
  getChatHistory
);

// CRITICAL: This is the route your frontend is calling that's getting 404
router.post("/api/chatdata", authMiddleware, debugAuth, requireAuth, postChat);

router.get(
  "/api/getsinglechat/:id",
  authMiddleware,
  debugAuth,
  requireAuth,
  getSingleChat
);
router.put(
  "/api/updatelocation",
  authMiddleware,
  debugAuth,
  requireAuth,
  updateLocation
);
router.post(
  "/api/create-chat-history",
  authMiddleware,
  debugAuth,
  requireAuth,
  createChatHistory
);
router.put(
  "/api/update-chat-history",
  authMiddleware,
  debugAuth,
  updateChatHistory
);
router.post(
  "/api/create-chat-history-enhanced",
  authMiddleware,
  debugAuth,
  createChatHistoryEnhanced
);
router.post(
  "/api/append-chat-message",
  authMiddleware,
  debugAuth,
  appendChatMessage
);
router.delete(
  "/api/deletechathistory",
  authMiddleware,
  debugAuth,
  requireAuth,
  deleteChatHistoryController
);
router.post("/api/deepsearch", authMiddleware, debugAuth, deepSearchHandler);

// Routes with /gemini prefix for backward compatibility - ALL SECURED
router.get(
  "/gemini/api/getsinglechat/:id",
  authMiddleware,
  debugAuth,
  requireAuth,
  getSingleChat
);
router.post(
  "/gemini/api/chat",
  authMiddleware,
  debugAuth,
  requireAuth,
  rateLimit,
  postGemini
);
router.get(
  "/gemini/api/getchathistory",
  authMiddleware,
  debugAuth,
  requireAuth,
  getChatHistory
);
router.delete(
  "/gemini/api/deletechathistory",
  authMiddleware,
  debugAuth,
  requireAuth,
  deleteChatHistoryController
);

router.post(
  "/gemini/api/search-with-ai",
  authMiddleware,
  debugAuth,
  searchWithAIHandler
);
router.post("/gemini/api/agent", authMiddleware, debugAuth, agentHandler);

// CRITICAL FIX: Add route to get user's chat statistics
router.get(
  "/api/user/chat-stats",
  authMiddleware,
  debugAuth,
  requireAuth,
  async (req, res) => {
    try {
      const { user } = await import("../model/user.js");

      console.log(`[ChatStats] Getting stats for user: ${req.user._id}`);

      const userData = await user.findById(req.user._id).populate({
        path: "chatHistory",
        match: { user: req.user._id }, // Ensure user filtering
        select: "title timestamp type",
      });

      if (!userData) {
        console.warn(`[ChatStats] User not found: ${req.user._id}`);
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Filter to ensure only user's chats
      const userChats = userData.chatHistory.filter(
        (chat) =>
          chat && chat.user && chat.user.toString() === req.user._id.toString()
      );

      console.log(
        `[ChatStats] Found ${userChats.length} chats for user ${req.user._id}`
      );

      res.json({
        success: true,
        stats: {
          totalChats: userChats.length,
          maxChats: 15,
          remaining: Math.max(0, 15 - userChats.length),
          oldestChat:
            userChats.length > 0
              ? Math.min(...userChats.map((chat) => new Date(chat.timestamp)))
              : null,
          newestChat:
            userChats.length > 0
              ? Math.max(...userChats.map((chat) => new Date(chat.timestamp)))
              : null,
          chatTypes: userChats.reduce((acc, chat) => {
            const type = chat.type || "standard";
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {}),
        },
      });
    } catch (error) {
      console.error("[ChatStats] Error getting chat stats:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get chat statistics",
        debug: error.message,
      });
    }
  }
);

// 🆕 CRITICAL FIX: Add missing save-agent-chat route
router.post(
  "/api/save-agent-chat",
  authMiddleware,
  debugAuth,
  requireAuth,
  async (req, res) => {
    try {
      const {
        chatHistoryId,
        agentType,
        question,
        response,
        isNewConversation,
      } = req.body;

      console.log(
        `[SaveAgentChat] Processing: ${agentType}, new: ${isNewConversation}, chatId: ${chatHistoryId}`
      );

      // Enhanced logging for agent chat saves
      logToFile("agent-chat-save", {
        userId: req.user._id,
        agentType,
        isNewConversation,
        chatHistoryId,
        questionLength: question?.length || 0,
        responseLength: response?.length || 0,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });

      if (isNewConversation) {
        // Create new chat history
        console.log(
          `[SaveAgentChat] Creating new chat history for ${agentType}`
        );

        const createUrl = `${
          process.env.BASE_URL || "http://localhost:3030"
        }/api/create-chat-history-enhanced`;
        const createResponse = await fetch(createUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: req.headers.authorization,
            Cookie: req.headers.cookie,
          },
          body: JSON.stringify({
            title: `${agentType}: ${question.substring(0, 40)}`,
            message: {
              user: question,
              gemini: response,
              sources: [],
              relatedQuestions: [],
              queryKeywords: question
                .toLowerCase()
                .split(" ")
                .filter((kw) => kw.trim().length > 1),
              isPreformattedHTML: false,
            },
            isSearch: true,
            searchType: "agent",
            agentType: agentType,
            clientId: chatHistoryId,
          }),
        });

        if (createResponse.ok) {
          const createData = await createResponse.json();
          console.log(
            `[SaveAgentChat] ✅ Successfully created new chat: ${createData.chatHistoryId}`
          );

          // Log successful creation
          logToFile("agent-chat-success", {
            userId: req.user._id,
            operation: "create",
            chatHistoryId: createData.chatHistoryId,
            agentType,
          });

          return res.json({
            success: true,
            chatHistoryId: createData.chatHistoryId,
            message: "Chat history created successfully",
          });
        } else {
          const errorText = await createResponse.text();
          console.error(
            `[SaveAgentChat] ❌ Failed to create chat: ${createResponse.status} - ${errorText}`
          );
          throw new Error(`Create chat failed: ${createResponse.status}`);
        }
      } else {
        // Append to existing chat
        console.log(
          `[SaveAgentChat] Appending to existing chat: ${chatHistoryId}`
        );

        const appendUrl = `${
          process.env.BASE_URL || "http://localhost:3030"
        }/api/append-chat-message`;
        const appendResponse = await fetch(appendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: req.headers.authorization,
            Cookie: req.headers.cookie,
          },
          body: JSON.stringify({
            chatHistoryId: chatHistoryId,
            message: {
              user: question,
              gemini: response,
              sources: [],
              relatedQuestions: [],
              queryKeywords: question
                .toLowerCase()
                .split(" ")
                .filter((kw) => kw.trim().length > 1),
              isPreformattedHTML: false,
            },
            isSearch: true,
            searchType: "agent",
            agentType: agentType,
          }),
        });

        if (appendResponse.ok) {
          const appendData = await appendResponse.json();
          console.log(
            `[SaveAgentChat] ✅ Successfully appended to chat: ${chatHistoryId}`
          );

          // Log successful append
          logToFile("agent-chat-success", {
            userId: req.user._id,
            operation: "append",
            chatHistoryId: chatHistoryId,
            agentType,
            messageCount: appendData.messageCount,
          });

          return res.json({
            success: true,
            chatHistoryId: chatHistoryId,
            message: "Message appended successfully",
            messageCount: appendData.messageCount,
          });
        } else {
          const errorText = await appendResponse.text();
          console.error(
            `[SaveAgentChat] ❌ Failed to append: ${appendResponse.status} - ${errorText}`
          );
          throw new Error(`Append message failed: ${appendResponse.status}`);
        }
      }
    } catch (error) {
      console.error("[SaveAgentChat] ❌ Error:", error);

      // Log error
      logToFile("agent-chat-error", {
        userId: req.user?._id,
        error: error.message,
        stack: error.stack,
        requestBody: req.body,
      });

      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// 🆕 CRITICAL FIX: Add missing error-report route with enhanced logging
router.post(
  "/api/error-report",
  authMiddleware,
  debugAuth,
  async (req, res) => {
    try {
      const errorReport = req.body;
      console.log("📊 [ErrorReport] Received error report:", errorReport.type);

      // Enhanced error logging with user context
      const enhancedErrorReport = {
        ...errorReport,
        userId: req.user?._id,
        userAgent: req.headers["user-agent"],
        ip: req.ip,
        serverTimestamp: new Date().toISOString(),
      };

      // Log to file for permanent storage
      logToFile("error-report", enhancedErrorReport);

      // Also log to console with formatting for immediate visibility
      console.error(`🚨 [ErrorReport] ${errorReport.type}:`, {
        timestamp: errorReport.timestamp,
        url: errorReport.url,
        userId: req.user?._id,
        error: errorReport.error,
        context: errorReport.context,
      });

      res.json({
        success: true,
        message: "Error report received and logged",
        reportId: `err_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 7)}`,
      });
    } catch (error) {
      console.error("❌ [ErrorReport] Failed to process error report:", error);
      res.status(500).json({
        success: false,
        error: "Failed to process error report",
      });
    }
  }
);

// 🆕 CRITICAL FIX: Add missing feedback route with comprehensive logging
router.post("/api/feedback", authMiddleware, debugAuth, async (req, res) => {
  try {
    const feedback = req.body;
    console.log("💬 [Feedback] Received feedback:", feedback.feedbackType);

    // Get detailed user information from database
    let userDetails = null;
    if (req.user?._id) {
      try {
        const { user } = await import("../model/user.js");
        const userData = await user
          .findById(req.user._id)
          .select(
            "email name username createdAt subscription role chatHistory"
          );

        if (userData) {
          userDetails = {
            userId: userData._id.toString(),
            email: userData.email,
            name: userData.name,
            username: userData.username,
            accountAge: Math.floor(
              (new Date() - new Date(userData.createdAt)) /
                (1000 * 60 * 60 * 24)
            ), // days
            subscription: userData.subscription || "free",
            role: userData.role || "user",
            totalChats: userData.chatHistory?.length || 0,
          };
        }
      } catch (userError) {
        console.warn(
          "⚠️ [Feedback] Failed to fetch user details:",
          userError.message
        );
      }
    }

    // Enhanced feedback logging with full context including question and user details
    const enhancedFeedback = {
      ...feedback,
      // User Information
      userId: req.user?._id,
      userDetails: userDetails,

      // Question/Query Information
      userQuestion:
        feedback.userQuery || feedback.question || feedback.originalQuery,
      questionLength:
        (feedback.userQuery || feedback.question || feedback.originalQuery)
          ?.length || 0,

      // Response Information
      responseLength: feedback.messageContent?.length || 0,
      responsePreview: feedback.messageContent?.substring(0, 200) + "...",

      // Technical Context
      userAgent: req.headers["user-agent"],
      ip: req.ip,
      referer: req.headers.referer,
      serverTimestamp: new Date().toISOString(),
      sessionId: req.headers["x-session-id"] || "unknown",

      // Search/Agent Context
      searchType: feedback.searchType,
      agentType: feedback.agentType,
      sourcesCount: feedback.sources?.length || 0,
      relatedQuestionsCount: feedback.relatedQuestions?.length || 0,

      // Performance metrics if available
      responseTime: feedback.responseTime,
      tokensUsed: feedback.tokensUsed,
    };

    // Log to file for analysis and improvement
    logToFile("user-feedback", enhancedFeedback);

    // Detailed console logging for immediate review
    console.log(
      `📝 [Feedback] ${feedback.type || "general"} - ${feedback.feedbackType}:`,
      {
        messageId: feedback.messageId,
        chatHistoryId: feedback.chatHistoryId,
        userId: req.user?._id,
        userEmail: userDetails?.email,
        timestamp: feedback.timestamp,
        question:
          feedback.userQuery?.substring(0, 100) + "..." ||
          "No question provided",
        contentPreview: feedback.messageContent?.substring(0, 100) + "...",
        sources: feedback.sources?.length || 0,
        searchType: feedback.searchType,
        agentType: feedback.agentType,
      }
    );

    // Special handling for negative feedback with enhanced alerting
    if (feedback.feedbackType === "negative") {
      console.warn(`⚠️ [Feedback] NEGATIVE FEEDBACK ALERT:`, {
        userId: req.user?._id,
        userEmail: userDetails?.email,
        messageId: feedback.messageId,
        userQuery: feedback.userQuery || feedback.question,
        responsePreview: feedback.messageContent?.substring(0, 150) + "...",
        searchType: feedback.searchType,
        agentType: feedback.agentType,
        timestamp: new Date().toISOString(),
        accountAge: userDetails?.accountAge,
        totalChats: userDetails?.totalChats,
      });

      // Log negative feedback separately for priority review with full context
      logToFile("negative-feedback", {
        ...enhancedFeedback,
        priority: "high",
        alertType: "negative_feedback",
        needsReview: true,
      });
    }

    // Special handling for positive feedback to identify what works well
    if (feedback.feedbackType === "positive") {
      console.log(`✅ [Feedback] POSITIVE FEEDBACK:`, {
        userId: req.user?._id,
        searchType: feedback.searchType,
        agentType: feedback.agentType,
        sourcesUsed: feedback.sources?.length || 0,
        responseLength: feedback.messageContent?.length || 0,
      });

      // Log positive feedback for success pattern analysis
      logToFile("positive-feedback", {
        ...enhancedFeedback,
        successPattern: true,
      });
    }

    res.json({
      success: true,
      message: "Feedback received and logged",
      feedbackId: `fb_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 7)}`,
      context: {
        userQuestion:
          feedback.userQuery?.substring(0, 50) + "..." || "No question",
        feedbackType: feedback.feedbackType,
        hasUserDetails: !!userDetails,
      },
    });
  } catch (error) {
    console.error("❌ [Feedback] Failed to process feedback:", error);

    // Enhanced error logging for feedback processing failures
    logToFile("feedback-error", {
      error: error.message,
      stack: error.stack,
      requestBody: req.body,
      userId: req.user?._id,
      timestamp: new Date().toISOString(),
      headers: {
        userAgent: req.headers["user-agent"],
        referer: req.headers.referer,
      },
    });

    res.status(500).json({
      success: false,
      error: "Failed to process feedback",
      debug: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// CRITICAL FIX: Add debugging route to check data consistency
router.get(
  "/api/debug/user-chats",
  authMiddleware,
  debugAuth,
  requireAuth,
  async (req, res) => {
    try {
      const { user } = await import("../model/user.js");
      const { chatHistory } = await import("../model/chatHistory.js");
      const { chat } = await import("../model/chat.js");

      console.log(
        `[Debug] Checking data consistency for user: ${req.user._id}`
      );

      // Get user data
      const userData = await user.findById(req.user._id);

      if (!userData) {
        return res.json({
          success: false,
          error: "User not found",
          userId: req.user._id,
        });
      }

      // Check each chat history in user's list
      const chatChecks = [];

      for (const chatHistoryId of userData.chatHistory) {
        const chatHistoryDoc = await chatHistory.findById(chatHistoryId);
        const chatDoc = chatHistoryDoc
          ? await chat.findOne({ chatHistory: chatHistoryId })
          : null;

        chatChecks.push({
          id: chatHistoryId.toString(),
          exists: !!chatHistoryDoc,
          belongsToUser: chatHistoryDoc
            ? chatHistoryDoc.user.toString() === req.user._id.toString()
            : false,
          hasMessages: chatDoc ? chatDoc.messages.length : 0,
          title: chatHistoryDoc ? chatHistoryDoc.title : null,
          type: chatHistoryDoc ? chatHistoryDoc.type : null,
          timestamp: chatHistoryDoc ? chatHistoryDoc.timestamp : null,
        });
      }

      // Get all chat histories that belong to this user (including orphaned ones)
      const allUserChats = await chatHistory.find({ user: req.user._id });

      res.json({
        success: true,
        debug: {
          userId: req.user._id,
          userChatHistoryCount: userData.chatHistory.length,
          chatChecks: chatChecks,
          allUserChatsInDb: allUserChats.length,
          orphanedChats: allUserChats
            .filter(
              (chat) =>
                !userData.chatHistory.some(
                  (id) => id.toString() === chat._id.toString()
                )
            )
            .map((chat) => ({
              id: chat._id.toString(),
              title: chat.title,
              timestamp: chat.timestamp,
            })),
        },
      });
    } catch (error) {
      console.error("[Debug] Error in debug route:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// CRITICAL FIX: Add route to clean up user's data inconsistencies
router.post(
  "/api/debug/fix-user-chats",
  authMiddleware,
  debugAuth,
  requireAuth,
  async (req, res) => {
    try {
      const { user } = await import("../model/user.js");
      const { chatHistory } = await import("../model/chatHistory.js");
      const { chat } = await import("../model/chat.js");

      console.log(`[FixChats] Fixing chat data for user: ${req.user._id}`);

      const userData = await user.findById(req.user._id);
      if (!userData) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      let fixedCount = 0;
      let removedCount = 0;

      // Step 1: Remove invalid chat history references from user
      const validChatHistoryIds = [];

      for (const chatHistoryId of userData.chatHistory) {
        const chatHistoryDoc = await chatHistory.findOne({
          _id: chatHistoryId,
          user: req.user._id, // Ensure it belongs to this user
        });

        if (chatHistoryDoc) {
          validChatHistoryIds.push(chatHistoryId);
        } else {
          console.log(
            `[FixChats] Removing invalid chat history reference: ${chatHistoryId}`
          );
          removedCount++;
        }
      }

      // Step 2: Add any orphaned chat histories that belong to this user
      const allUserChats = await chatHistory.find({ user: req.user._id });

      for (const chatHistoryDoc of allUserChats) {
        if (
          !validChatHistoryIds.some(
            (id) => id.toString() === chatHistoryDoc._id.toString()
          )
        ) {
          console.log(
            `[FixChats] Adding orphaned chat history: ${chatHistoryDoc._id}`
          );
          validChatHistoryIds.push(chatHistoryDoc._id);
          fixedCount++;
        }
      }

      // Step 3: Enforce 15 chat limit (keep most recent)
      if (validChatHistoryIds.length > 15) {
        // Sort chat histories by timestamp (most recent first)
        const sortedChats = await chatHistory
          .find({
            _id: { $in: validChatHistoryIds },
            user: req.user._id,
          })
          .sort({ timestamp: -1 });

        const chatsToKeep = sortedChats.slice(0, 15);
        const chatsToRemove = sortedChats.slice(15);

        // Remove old chats
        for (const oldChat of chatsToRemove) {
          await chat.deleteOne({ chatHistory: oldChat._id });
          await chatHistory.deleteOne({ _id: oldChat._id });
          console.log(
            `[FixChats] Removed old chat due to limit: ${oldChat._id}`
          );
        }

        validChatHistoryIds.splice(
          0,
          validChatHistoryIds.length,
          ...chatsToKeep.map((c) => c._id)
        );
      }

      // Step 4: Update user's chat history
      userData.chatHistory = validChatHistoryIds;
      await userData.save();

      console.log(
        `[FixChats] Fixed user ${req.user._id}: +${fixedCount} added, -${removedCount} removed`
      );

      res.json({
        success: true,
        message: `Fixed chat data for user`,
        changes: {
          added: fixedCount,
          removed: removedCount,
          finalCount: validChatHistoryIds.length,
        },
      });
    } catch (error) {
      console.error("[FixChats] Error fixing user chats:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// 📊 Add route to view logs (for development/debugging)
router.get(
  "/api/debug/logs/:type",
  authMiddleware,
  debugAuth,
  requireAuth,
  async (req, res) => {
    try {
      const { type } = req.params;
      const { limit = 50 } = req.query;

      const logFile = path.join(
        logsDir,
        `${type}-${new Date().toISOString().split("T")[0]}.log`
      );

      if (!fs.existsSync(logFile)) {
        return res.json({
          success: false,
          error: `No logs found for type: ${type}`,
          availableTypes: [
            "user-feedback",
            "positive-feedback",
            "negative-feedback",
            "agent-chat-save",
            "agent-chat-success",
            "agent-chat-error",
            "error-report",
            "feedback-error",
          ],
        });
      }

      const logContent = fs.readFileSync(logFile, "utf8");
      const logLines = logContent
        .trim()
        .split("\n")
        .filter((line) => line);
      const recentLogs = logLines.slice(-limit).map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { raw: line };
        }
      });

      res.json({
        success: true,
        logs: recentLogs,
        totalCount: logLines.length,
        logFile: logFile,
        requestedLimit: limit,
      });
    } catch (error) {
      console.error("[Debug] Error reading logs:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

console.log("[Routes] All routes configured successfully");
console.log("📁 [Logger] Logs will be stored in:", logsDir);
console.log(
  "📊 [Logger] Available log types: user-feedback, positive-feedback, agent-chat-save, error-report, negative-feedback, feedback-error, agent-chat-error, agent-chat-success"
);

export default router;
