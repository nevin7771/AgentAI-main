// server/router/public.js - FIXED ROUTES WITH BETTER DEBUGGING
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
  appendChatMessage,
} from "../controller/public.js";
import {
  deepSearchHandler,
  searchWithAIHandler,
  agentHandler,
} from "../controller/agent.js";

import { authMiddleware } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

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

console.log("[Routes] All routes configured successfully");

export default router;
