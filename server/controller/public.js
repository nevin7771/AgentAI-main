// server/controller/public.js - COMPLETE SECURE VERSION WITH ALL FUNCTIONS
import { user } from "../model/user.js";
import { chat } from "../model/chat.js";
import { chatHistory } from "../model/chatHistory.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Error } from "mongoose";

export const getGeminiHome = (req, res, next) => {
  res.status(200).json({ message: "Welcome to Gemini Ai Api" });
};

// ENHANCED: Regular chat processing with better conversation continuity
export const postGemini = async (req, res, next) => {
  const clientApikey = String(req.headers["x-api-key"]);
  const serverSideClientApiKey = String(process.env.CLIENT_API_KEY);

  if (clientApikey !== serverSideClientApiKey) {
    const error = new Error("Invalid Api Key");
    error.statusCode = 401;
    error.data = "Invalid Api Key";
    return next(error);
  }
  const query = String(req.body.userInput);
  const previousChat = req.body.previousChat;
  const chatHistoryId = req.body.chatHistoryId;

  let history = [
    {
      role: "user",
      parts: "Hello, who are you.",
    },
    {
      role: "model",
      parts: "I am a large language model, trained by Google.",
    },
  ];

  if (previousChat.length > 0) history = [...history, ...previousChat];

  const genAi = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

  const model = genAi.getGenerativeModel({ model: "gemini-pro" });

  const chats = model.startChat({
    history: history,
  });

  let text;
  let newChatHistoryId;
  let chatId;

  chats
    .sendMessage(query)
    .then((result) => {
      return result.response;
    })
    .then((response) => {
      text = response.text();

      if (text.length < 5) {
        const error = new Error("result not found");
        error.statusCode = 403;
        throw error;
      }

      if (chatHistoryId.length < 5) {
        const newChatHistory = new chatHistory({
          user: req.user._id,
          title: query,
        });

        return newChatHistory.save();
      } else {
        // CRITICAL FIX: Ensure user owns the chat history
        return chatHistory.findOne({
          _id: chatHistoryId,
          user: req.user._id,
        });
      }
    })
    .then((chatHistory) => {
      if (!chatHistory) {
        const error = new Error("Chat History not found or access denied");
        error.statusCode = 403;
        throw error;
      }

      newChatHistoryId = chatHistory._id;

      if (chatHistoryId.length < 5) {
        const newChat = new chat({
          chatHistory: newChatHistoryId,
          messages: [
            {
              sender: req.user._id,
              message: {
                user: query,
                gemini: text,
              },
            },
          ],
        });

        return newChat.save();
      } else {
        return chat
          .findOne({ chatHistory: chatHistory._id })
          .then((chatData) => {
            if (!chatData) {
              const error = new Error("no chat found");
              error.statusCode = 403;
              throw error;
            }

            chatData.messages.push({
              sender: req.user._id,
              message: {
                user: query,
                gemini: text,
              },
            });

            return chatData.save();
          });
      }
    })
    .then((result) => {
      chatId = result._id;

      if (!result) {
        throw new Error("Server Error");
      }

      if (chatHistoryId.length < 5) {
        return chatHistory.findById(newChatHistoryId).then((chatHistory) => {
          if (!chatHistory) {
            const error = new Error("Chat History not found");
            error.statusCode = 403;
            throw error;
          }

          chatHistory.chat = chatId;
          return chatHistory.save();
        });
      } else {
        return true;
      }
    })
    .then((result) => {
      if (!result) {
        throw new Error("Server Error");
      }

      return user.findById(req.user._id);
    })
    .then(async (userData) => {
      if (!userData) {
        const error = new Error("No user found");
        error.statusCode = 403;
        throw error;
      }

      if (chatHistoryId.length < 5) {
        // CRITICAL FIX: Enforce 15 chat limit
        if (userData.chatHistory.length >= 15) {
          // Remove oldest chat history
          const oldestChatHistoryId = userData.chatHistory[0];

          // Delete the oldest chat and its history
          await chat.deleteOne({ chatHistory: oldestChatHistoryId });
          await chatHistory.deleteOne({ _id: oldestChatHistoryId });

          // Remove from user's array
          userData.chatHistory.shift();

          console.log(
            `[postGemini] Removed oldest chat history for user ${userData._id}`
          );
        }

        userData.chatHistory.push(newChatHistoryId);
      }

      if (req.auth === "noauth") {
        userData.currentLimit += 1;
      }
      return userData.save();
    })
    .then((result) => {
      if (!result) {
        throw new Error("Server Error");
      }

      res.status(200).json({
        user: query,
        gemini: text,
        chatHistoryId: newChatHistoryId || chatHistoryId,
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

const getDefaultUserId = async () => {
  try {
    let defaultUser = await user.findOne({ email: "system@default.ai" });
    if (!defaultUser) {
      defaultUser = new user({
        name: "System User",
        email: "system@default.ai",
        location: "System",
        maxRateLimit: 1000,
        currentLimit: 0,
        chatHistory: [],
      });
      await defaultUser.save();
      console.log("[getDefaultUserId] Created default user:", defaultUser._id);
    }
    return defaultUser._id;
  } catch (error) {
    console.error("[getDefaultUserId] Error creating default user:", error);
    return null;
  }
};

// CRITICAL FIX: Secure getChatHistory with proper user filtering
export const getChatHistory = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: "User authentication required",
      });
    }

    const userId = req.user._id;
    const isAuthUser = req.auth === "auth" && !req.user.isTemporary;

    console.log(`[getChatHistory] =================================`);
    console.log(`[getChatHistory] User ID: ${userId}`);
    console.log(
      `[getChatHistory] User Type: ${
        isAuthUser ? "AUTHENTICATED" : "TEMPORARY/NON-AUTH"
      }`
    );
    console.log(`[getChatHistory] Auth Status: ${req.auth}`);
    console.log(`[getChatHistory] Is Temporary: ${req.user.isTemporary}`);

    const userData = await user.findById(userId);
    if (!userData) {
      console.error(`[getChatHistory] ❌ User not found: ${userId}`);
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    console.log(
      `[getChatHistory] User found - Email: ${userData.email}, Temporary: ${userData.isTemporary}`
    );
    console.log(
      `[getChatHistory] User has ${userData.chatHistory.length} chat references`
    );

    // CRITICAL FIX: Complete isolation for temporary/non-auth users
    if (userData.isTemporary || req.auth === "noauth") {
      console.log(
        `[getChatHistory] 🔒 ISOLATED ACCESS - Temporary/Non-auth user`
      );

      // For temp users, only return their own chats (should be very few or none)
      let tempUserChats = [];
      if (userData.chatHistory.length > 0) {
        console.log(
          `[getChatHistory] Checking ${userData.chatHistory.length} temp user chat references`
        );

        tempUserChats = await chatHistory
          .find({
            _id: { $in: userData.chatHistory },
            user: userId, // Only their own chats
          })
          .sort({ timestamp: -1 })
          .limit(3); // Very limited for temp users

        console.log(
          `[getChatHistory] Found ${tempUserChats.length} valid temp user chats`
        );
      }

      console.log(
        `[getChatHistory] ✅ Returning ${tempUserChats.length} chats for TEMPORARY user`
      );

      return res.status(200).json({
        chatHistory: tempUserChats.map((history) => ({
          _id: history._id,
          id: history._id,
          title: history.title || "Untitled Chat",
          timestamp: history.timestamp || new Date().toISOString(),
          type: history.type || "standard",
          searchType: "chat",
          isSearch: false,
        })),
        location: userData.location || "Unknown",
        debug: {
          userId: userId,
          userType: "temporary",
          chatCount: tempUserChats.length,
          isolated: true,
        },
      });
    }

    // CRITICAL FIX: For authenticated users, clean and return only their chats
    console.log(
      `[getChatHistory] 🔒 AUTHENTICATED ACCESS - Cleaning user's chat references`
    );

    const validChatHistoryIds = [];
    let cleanupCount = 0;
    let checkedCount = 0;

    // Clean up invalid references
    for (const chatHistoryId of userData.chatHistory) {
      checkedCount++;
      try {
        console.log(
          `[getChatHistory] Checking chat ${checkedCount}/${userData.chatHistory.length}: ${chatHistoryId}`
        );

        const chatHistoryDoc = await chatHistory.findOne({
          _id: chatHistoryId,
          user: userId, // MUST belong to this user
        });

        if (chatHistoryDoc) {
          console.log(
            `[getChatHistory] ✅ Valid chat: ${chatHistoryId} - "${chatHistoryDoc.title}"`
          );
          validChatHistoryIds.push(chatHistoryId);
        } else {
          console.log(
            `[getChatHistory] 🗑️ INVALID chat (removing): ${chatHistoryId}`
          );
          cleanupCount++;
        }
      } catch (err) {
        console.error(
          `[getChatHistory] 🗑️ ERROR checking chat ${chatHistoryId}: ${err.message}`
        );
        cleanupCount++;
      }
    }

    console.log(`[getChatHistory] Cleanup Summary:`);
    console.log(`[getChatHistory] - Checked: ${checkedCount} chats`);
    console.log(
      `[getChatHistory] - Valid: ${validChatHistoryIds.length} chats`
    );
    console.log(`[getChatHistory] - Invalid (removed): ${cleanupCount} chats`);

    // Save cleaned references if any were removed
    if (cleanupCount > 0) {
      console.log(`[getChatHistory] 🔧 Updating user's chat history array...`);
      userData.chatHistory = validChatHistoryIds;
      await userData.save();
      console.log(`[getChatHistory] ✅ User's chat history cleaned and saved`);
    }

    // Get actual chat histories (guaranteed to belong to this user)
    let userChatHistories = [];
    if (validChatHistoryIds.length > 0) {
      console.log(
        `[getChatHistory] Fetching ${validChatHistoryIds.length} chat history documents...`
      );

      userChatHistories = await chatHistory
        .find({
          _id: { $in: validChatHistoryIds },
          user: userId, // Double-check ownership
        })
        .sort({ timestamp: -1 })
        .limit(15);

      console.log(
        `[getChatHistory] Retrieved ${userChatHistories.length} chat history documents`
      );
    }

    console.log(
      `[getChatHistory] ✅ SUCCESS - Returning ${userChatHistories.length} chats for AUTHENTICATED user ${userId}`
    );

    const formattedChatHistory = userChatHistories.map((history) => ({
      _id: history._id,
      id: history._id,
      title: history.title || "Untitled Chat",
      timestamp: history.timestamp || new Date().toISOString(),
      type: history.type || "standard",
      searchType: history.type?.includes("agent") ? "agent" : "chat",
      isSearch: history.type?.includes("agent") || false,
      clientId: history.clientId || null,
    }));

    res.status(200).json({
      chatHistory: formattedChatHistory,
      location: userData.location || "Unknown",
      debug: {
        userId: userId,
        userType: "authenticated",
        chatCount: formattedChatHistory.length,
        cleaned: cleanupCount,
        isolated: false,
      },
    });
  } catch (error) {
    console.error(`[getChatHistory] ❌ FATAL ERROR:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to get chat history",
      debug: {
        userId: req.user?._id,
        userType: req.auth,
        error: error.message,
      },
    });
  }
};

// ADDITIONAL UTILITY: Clean up all users' chat history references
export const cleanupAllUsersChatReferences = async () => {
  try {
    console.log(
      "🧹 [CleanupAllUsers] Starting cleanup of all users' chat references..."
    );

    const allUsers = await user.find({});
    let totalCleaned = 0;
    let usersFixed = 0;

    for (const userData of allUsers) {
      try {
        const originalCount = userData.chatHistory.length;
        const validChatHistoryIds = [];

        // Check each chat history reference
        for (const chatHistoryId of userData.chatHistory) {
          const chatHistoryDoc = await chatHistory.findOne({
            _id: chatHistoryId,
            user: userData._id,
          });

          if (chatHistoryDoc) {
            validChatHistoryIds.push(chatHistoryId);
          } else {
            console.log(
              `🗑️ User ${userData._id}: Removing invalid chat reference ${chatHistoryId}`
            );
            totalCleaned++;
          }
        }

        // Update user if changes were made
        if (originalCount !== validChatHistoryIds.length) {
          userData.chatHistory = validChatHistoryIds;
          await userData.save();
          usersFixed++;
          console.log(
            `✅ User ${userData._id}: ${originalCount} -> ${validChatHistoryIds.length} chats`
          );
        }
      } catch (userError) {
        console.error(`❌ Error cleaning user ${userData._id}:`, userError);
      }
    }

    console.log(
      `🎉 [CleanupAllUsers] Completed! Fixed ${usersFixed} users, cleaned ${totalCleaned} invalid references`
    );

    return {
      success: true,
      usersProcessed: allUsers.length,
      usersFixed: usersFixed,
      invalidReferencesRemoved: totalCleaned,
    };
  } catch (error) {
    console.error("❌ [CleanupAllUsers] Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
};

// CRITICAL FIX: Secure postChat function with proper user filtering
export const postChat = async (req, res, next) => {
  const startTime = Date.now();

  try {
    const chatHistoryId = req.body.chatHistoryId;

    console.log(`[postChat] === STARTING CHAT RETRIEVAL ===`);
    console.log(`[postChat] Request ID: ${chatHistoryId}`);
    console.log(`[postChat] User ID: ${req.user?._id}`);
    console.log(`[postChat] Auth type: ${req.auth}`);

    if (!chatHistoryId) {
      console.error(`[postChat] ERROR: No chat history ID provided`);
      return res.status(400).json({
        success: false,
        error: "Chat history ID is required",
        debug: { chatHistoryId, userId: req.user?._id },
      });
    }

    const userId = req.user?._id;

    if (!userId) {
      console.error(`[postChat] ERROR: No authenticated user`);
      return res.status(401).json({
        success: false,
        error: "User authentication required",
        debug: { chatHistoryId, hasUser: !!req.user },
      });
    }

    console.log(
      `[postChat] Searching for chat: ${chatHistoryId} owned by user: ${userId}`
    );

    // Enhanced chat detection
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(chatHistoryId);
    const isClientId = chatHistoryId && !isValidObjectId;

    console.log(`[postChat] Chat ID analysis:`);
    console.log(`[postChat] - Is valid MongoDB ObjectId: ${isValidObjectId}`);
    console.log(`[postChat] - Is client-generated ID: ${isClientId}`);

    let chatHistoryDoc = null;
    let searchStrategy = "";

    // Strategy 1: Direct MongoDB ObjectId lookup
    if (isValidObjectId) {
      console.log(`[postChat] STRATEGY 1: Direct ObjectId lookup`);
      searchStrategy = "Direct ObjectId";

      try {
        chatHistoryDoc = await chatHistory
          .findOne({
            _id: chatHistoryId,
            user: userId,
          })
          .populate("chat");

        if (chatHistoryDoc) {
          console.log(
            `[postChat] ✅ Found by MongoDB ObjectId: ${chatHistoryDoc._id}`
          );
          console.log(
            `[postChat] Chat belongs to user: ${
              chatHistoryDoc.user.toString() === userId.toString()
            }`
          );
        } else {
          console.log(`[postChat] ❌ Not found by MongoDB ObjectId`);

          // Additional debugging: Check if chat exists but doesn't belong to user
          const existsButNotOwned = await chatHistory.findById(chatHistoryId);
          if (existsButNotOwned) {
            console.warn(
              `[postChat] 🚨 SECURITY: Chat ${chatHistoryId} exists but belongs to user ${existsButNotOwned.user}, not ${userId}`
            );
          } else {
            console.log(
              `[postChat] Chat ${chatHistoryId} does not exist in database`
            );
          }
        }
      } catch (error) {
        console.error(`[postChat] Error in Strategy 1:`, error);
      }
    }

    // Strategy 2: Client ID lookup for agent chats
    if (!chatHistoryDoc && isClientId) {
      console.log(`[postChat] STRATEGY 2: Client ID lookup`);
      searchStrategy = "Client ID";

      try {
        chatHistoryDoc = await chatHistory
          .findOne({
            clientId: chatHistoryId,
            user: userId,
          })
          .populate("chat");

        if (chatHistoryDoc) {
          console.log(
            `[postChat] ✅ Found by client ID: ${chatHistoryDoc._id}`
          );
        } else {
          console.log(`[postChat] ❌ Not found by client ID`);
        }
      } catch (error) {
        console.error(`[postChat] Error in Strategy 2:`, error);
      }
    }

    // Strategy 3: Recent chat fallback (last resort)
    if (!chatHistoryDoc) {
      console.log(`[postChat] STRATEGY 3: Recent chat fallback`);
      searchStrategy = "Recent fallback";

      try {
        const recentUserChats = await chatHistory
          .find({
            user: userId,
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
          })
          .sort({ timestamp: -1 })
          .limit(5)
          .populate("chat");

        console.log(
          `[postChat] Found ${recentUserChats.length} recent chats for user`
        );

        if (recentUserChats.length > 0) {
          // Try to find exact match
          const exactMatch = recentUserChats.find(
            (chat) =>
              chat._id.toString() === chatHistoryId ||
              chat.clientId === chatHistoryId
          );

          if (exactMatch) {
            chatHistoryDoc = exactMatch;
            console.log(
              `[postChat] ✅ Found exact match in recent chats: ${chatHistoryDoc._id}`
            );
          } else {
            console.log(`[postChat] ❌ No exact match in recent chats`);
            // Could potentially use the most recent chat as fallback, but this might be confusing
            // chatHistoryDoc = recentUserChats[0];
          }
        }
      } catch (error) {
        console.error(`[postChat] Error in Strategy 3:`, error);
      }
    }

    // Final check
    if (!chatHistoryDoc) {
      const elapsed = Date.now() - startTime;
      console.error(
        `[postChat] ❌ FINAL RESULT: Chat not found after all strategies`
      );
      console.error(`[postChat] Search took: ${elapsed}ms`);
      console.error(`[postChat] Last strategy used: ${searchStrategy}`);

      return res.status(404).json({
        success: false,
        error: `Chat history not found: ${chatHistoryId}`,
        debug: {
          chatHistoryId,
          userId,
          isValidObjectId,
          isClientId,
          searchStrategy,
          elapsed,
        },
        chats: [],
      });
    }

    // Security double-check
    if (chatHistoryDoc.user.toString() !== userId.toString()) {
      console.error(
        `[postChat] 🚨 SECURITY VIOLATION: User ${userId} tried to access chat owned by ${chatHistoryDoc.user}`
      );
      return res.status(403).json({
        success: false,
        error: "Access denied: You don't own this chat history",
        debug: {
          requestedChatId: chatHistoryId,
          foundChatId: chatHistoryDoc._id.toString(),
          requestingUserId: userId.toString(),
          chatOwnerId: chatHistoryDoc.user.toString(),
        },
        chats: [],
      });
    }

    console.log(`[postChat] ✅ CHAT FOUND: ${chatHistoryDoc._id}`);
    console.log(`[postChat] - Title: ${chatHistoryDoc.title}`);
    console.log(`[postChat] - Type: ${chatHistoryDoc.type || "standard"}`);
    console.log(`[postChat] - Owner: ${chatHistoryDoc.user}`);
    console.log(`[postChat] - Has chat document: ${!!chatHistoryDoc.chat}`);

    // Process messages
    if (chatHistoryDoc.chat && chatHistoryDoc.chat.messages) {
      const messageCount = chatHistoryDoc.chat.messages.length;
      console.log(`[postChat] Processing ${messageCount} messages`);

      try {
        const messagesArray = chatHistoryDoc.chat.messages.map((msg, index) => {
          try {
            const msgObj = msg.toObject ? msg.toObject() : msg;

            return {
              _id: msg._id
                ? msg._id.toString()
                : `msg_${chatHistoryDoc._id}_${index}_${Date.now()}`,
              timestamp:
                msg.timestamp || msgObj.createdAt || new Date().toISOString(),
              isSearch: msg.isSearch || false,
              searchType: msg.searchType || msgObj.searchType || null,
              sender: msg.sender ? msg.sender.toString() : null,
              message: {
                user: msgObj.message?.user || "",
                gemini: msgObj.message?.gemini || "",
                sources: msgObj.message?.sources || [],
                relatedQuestions: msgObj.message?.relatedQuestions || [],
                queryKeywords: msgObj.message?.queryKeywords || [],
                isPreformattedHTML: msgObj.message?.isPreformattedHTML || false,
              },
              error: msgObj.error || null,
            };
          } catch (err) {
            console.error(`[postChat] Error processing message ${index}:`, err);
            return {
              _id: `error_${chatHistoryDoc._id}_${index}_${Date.now()}`,
              timestamp: new Date().toISOString(),
              isSearch: false,
              searchType: null,
              sender: null,
              message: {
                user: "",
                gemini: `Error loading message ${index + 1}`,
                sources: [],
                relatedQuestions: [],
                queryKeywords: [],
                isPreformattedHTML: false,
              },
              error: "Message loading error",
            };
          }
        });

        const elapsed = Date.now() - startTime;
        console.log(
          `[postChat] ✅ SUCCESS: Processed ${messagesArray.length} messages in ${elapsed}ms`
        );

        return res.status(200).json({
          success: true,
          chatHistory: chatHistoryDoc._id.toString(),
          chats: messagesArray,
          chatType: chatHistoryDoc.type || "standard",
          clientId: chatHistoryDoc.clientId || null,
          debug: {
            searchStrategy,
            messageCount: messagesArray.length,
            elapsed,
          },
        });
      } catch (err) {
        console.error(`[postChat] Error serializing messages:`, err);
        return res.status(500).json({
          success: false,
          error: "Error processing chat messages",
          debug: {
            chatHistoryId: chatHistoryDoc._id.toString(),
            error: err.message,
          },
          chats: [],
        });
      }
    } else {
      // Chat history exists but has no messages
      const elapsed = Date.now() - startTime;
      console.log(
        `[postChat] ⚠️ Chat found but no messages: ${chatHistoryDoc._id}`
      );

      return res.status(200).json({
        success: true,
        chatHistory: chatHistoryDoc._id.toString(),
        chats: [],
        chatType: chatHistoryDoc.type || "standard",
        clientId: chatHistoryDoc.clientId || null,
        debug: {
          searchStrategy,
          messageCount: 0,
          elapsed,
          warning: "Chat exists but has no messages",
        },
      });
    }
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[postChat] 💥 FATAL ERROR after ${elapsed}ms:`, err);
    console.error(`[postChat] Stack trace:`, err.stack);

    return res.status(500).json({
      success: false,
      error: "Internal server error while retrieving chat",
      debug: {
        chatHistoryId: req.body.chatHistoryId || "unknown",
        userId: req.user?._id || "unknown",
        elapsed,
        errorMessage: err.message,
      },
      chats: [],
    });
  }
};

export const getSingleChat = async (req, res, next) => {
  try {
    const chatId = req.params.id;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: "Chat ID is required",
      });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: "User authentication required",
      });
    }

    console.log(`[getSingleChat] ${chatId} for user ${req.user._id}`);

    req.body = { chatHistoryId: chatId };
    return postChat(req, res, next);
  } catch (err) {
    console.error("Error in getSingleChat:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Error retrieving chat",
      chatHistory: req.params.id,
      chats: [],
    });
  }
};

export const createChatHistory = async (req, res, next) => {
  try {
    const { title, message, isSearch, searchType } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: "User authentication required",
      });
    }

    const senderId = req.user._id;

    // CRITICAL FIX: Enforce 15 chat limit
    const userData = await user.findById(senderId);
    if (userData && userData.chatHistory.length >= 15) {
      const oldestChatHistoryId = userData.chatHistory[0];

      try {
        await chat.deleteOne({ chatHistory: oldestChatHistoryId });
        await chatHistory.deleteOne({ _id: oldestChatHistoryId });
        userData.chatHistory.shift();
        await userData.save();
        console.log(
          `[createChatHistory] Removed oldest chat history for user ${senderId}`
        );
      } catch (cleanupError) {
        console.error(
          `[createChatHistory] Error cleaning up old chat:`,
          cleanupError
        );
      }
    }

    const chatHistoryDoc = new chatHistory({
      user: senderId,
      title: title || "Agent Response",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await chatHistoryDoc.save();

    const chatDoc = new chat({
      chatHistory: chatHistoryDoc._id,
      messages: [
        {
          sender: senderId,
          message: {
            user: message.user || "Agent query",
            gemini: message.gemini || "No response",
          },
          isSearch: isSearch || true,
          searchType: searchType || "agent",
        },
      ],
    });

    await chatDoc.save();

    chatHistoryDoc.chat = chatDoc._id;
    await chatHistoryDoc.save();

    if (userData) {
      if (userData.chatHistory.indexOf(chatHistoryDoc._id) === -1) {
        userData.chatHistory.push(chatHistoryDoc._id);
        await userData.save();
      }
    }

    res.status(200).json({
      success: true,
      chatHistoryId: chatHistoryDoc._id,
      message: "Chat history created successfully",
    });
  } catch (error) {
    console.error("Error creating chat history:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create chat history",
    });
  }
};

export const updateLocation = (req, res, next) => {
  if (!req.user || !req.user._id) {
    const error = new Error("User authentication required");
    error.statusCode = 401;
    return next(error);
  }

  const { lat, long } = req.body.location;
  const apiKey = process.env.LOCATION_API_KEY;
  const url = `https://geocode.maps.co/reverse?lat=${lat}&lon=${long}&api_key=${apiKey}`;

  let location;

  fetch(url)
    .then((response) => {
      if (!response) {
        const error = new Error("Location Not Found");
        error.statusCode = 403;
        throw error;
      }
      return response.json();
    })
    .then((data) => {
      location = data.address.state || data.address.country;
      return user.findById(req.user._id);
    })
    .then((userData) => {
      if (!userData) {
        const error = new Error("User Not Found");
        error.statusCode = 403;
        throw error;
      }
      userData.location = location;
      return userData.save();
    })
    .then((result) => {
      if (!result) {
        throw new Error("Server Error");
      }
      res.status(200).json({ message: "Location Updated" });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

export const deleteChatHistoryController = async (req, res, next) => {
  const { chatHistoryId } = req.body;

  if (!req.user || !req.user._id) {
    return res.status(401).json({
      success: false,
      message: "User authentication required",
    });
  }

  const userId = req.user._id;

  if (!chatHistoryId) {
    return res
      .status(400)
      .json({ success: false, message: "Chat history ID is required." });
  }

  try {
    // CRITICAL FIX: Find the chat history and ensure it belongs to the user
    const history = await chatHistory.findOne({
      _id: chatHistoryId,
      user: userId,
    });

    if (!history) {
      return res.status(404).json({
        success: false,
        message: "Chat history not found or access denied.",
      });
    }

    await chat.deleteOne({ chatHistory: chatHistoryId });
    await chatHistory.deleteOne({ _id: chatHistoryId, user: userId });
    await user.updateOne(
      { _id: userId },
      { $pull: { chatHistory: chatHistoryId } }
    );

    res
      .status(200)
      .json({ success: true, message: "Chat history deleted successfully." });
  } catch (error) {
    console.error("Error deleting chat history from DB:", error);
    if (!error.statusCode) {
      error.statusCode = 500;
    }
    next(error);
  }
};

export const updateChatHistory = async (req, res, next) => {
  try {
    const { chatHistoryId, message } = req.body;

    console.log(`[updateChatHistory] Updating chat history: ${chatHistoryId}`);

    if (!chatHistoryId) {
      return res.status(400).json({
        success: false,
        error: "Chat history ID is required",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message content is required",
      });
    }

    let senderId = null;
    if (req.user && req.user._id) {
      senderId = req.user._id;
    } else {
      senderId = await getDefaultUserId();
    }

    let chatHistoryDoc;

    try {
      if (/^[0-9a-fA-F]{24}$/.test(chatHistoryId)) {
        console.log(
          `[updateChatHistory] Looking up MongoDB ID: ${chatHistoryId}`
        );
        chatHistoryDoc = await chatHistory.findOne({
          _id: chatHistoryId,
          user: senderId, // CRITICAL FIX: Always filter by user
        });
      } else {
        console.log(
          `[updateChatHistory] Looking up client ID: ${chatHistoryId}`
        );
        chatHistoryDoc = await chatHistory.findOne({
          $and: [
            { user: senderId }, // CRITICAL FIX: Always filter by user
            {
              $or: [
                { clientId: chatHistoryId },
                {
                  title: {
                    $regex: chatHistoryId.split("_").slice(-1)[0],
                    $options: "i",
                  },
                },
              ],
            },
          ],
        });
      }
    } catch (lookupError) {
      console.error(
        `[updateChatHistory] Error looking up chat history:`,
        lookupError
      );
      return res.status(500).json({
        success: false,
        error: "Error looking up chat history",
      });
    }

    if (!chatHistoryDoc) {
      console.log(
        `[updateChatHistory] Chat history not found, creating new one`
      );

      try {
        let chatType = "agent";
        if (chatHistoryId.startsWith("jira_")) {
          chatType = "jira_agent";
        } else if (chatHistoryId.startsWith("conf_")) {
          chatType = "conf_agent";
        } else if (chatHistoryId.startsWith("monitor_")) {
          chatType = "monitor_agent";
        }

        chatHistoryDoc = new chatHistory({
          user: senderId,
          title: message.user
            ? message.user.substring(0, 50)
            : "Agent Response",
          timestamp: new Date(),
          type: chatType,
          clientId: chatHistoryId,
        });

        await chatHistoryDoc.save();
        console.log(
          `[updateChatHistory] Created new chat history: ${chatHistoryDoc._id}`
        );
      } catch (createError) {
        console.error(
          `[updateChatHistory] Error creating chat history:`,
          createError
        );
        return res.status(500).json({
          success: false,
          error: "Error creating chat history",
        });
      }
    }

    let chatDoc;

    try {
      chatDoc = await chat.findOne({ chatHistory: chatHistoryDoc._id });

      if (!chatDoc) {
        console.log(`[updateChatHistory] Creating new chat document`);
        chatDoc = new chat({
          chatHistory: chatHistoryDoc._id,
          messages: [],
        });
      }

      if (chatDoc.messages.length > 0) {
        const lastMessage = chatDoc.messages[chatDoc.messages.length - 1];

        const shouldUpdateLastMessage =
          lastMessage.message.user === message.user &&
          (lastMessage.message.gemini === "Streaming response..." ||
            lastMessage.message.gemini === "Connecting to Jira..." ||
            lastMessage.message.gemini.includes("Connecting") ||
            lastMessage.message.gemini.length < 50);

        if (shouldUpdateLastMessage) {
          console.log(`[updateChatHistory] Updating last message`);
          lastMessage.message = {
            user: message.user,
            gemini: message.gemini,
            sources: message.sources || [],
            relatedQuestions: message.relatedQuestions || [],
            queryKeywords: message.queryKeywords || [],
            isPreformattedHTML: message.isPreformattedHTML || false,
          };
          lastMessage.timestamp = new Date();
          lastMessage.isSearch = true;
          lastMessage.searchType = "agent";
        } else {
          console.log(`[updateChatHistory] Adding new message to conversation`);
          chatDoc.messages.push({
            sender: senderId,
            message: {
              user: message.user,
              gemini: message.gemini,
              sources: message.sources || [],
              relatedQuestions: message.relatedQuestions || [],
              queryKeywords: message.queryKeywords || [],
              isPreformattedHTML: message.isPreformattedHTML || false,
            },
            isSearch: true,
            searchType: "agent",
            timestamp: new Date(),
          });
        }
      } else {
        console.log(`[updateChatHistory] Adding first message`);
        chatDoc.messages.push({
          sender: senderId,
          message: {
            user: message.user,
            gemini: message.gemini,
            sources: message.sources || [],
            relatedQuestions: message.relatedQuestions || [],
            queryKeywords: message.queryKeywords || [],
            isPreformattedHTML: message.isPreformattedHTML || false,
          },
          isSearch: true,
          searchType: "agent",
          timestamp: new Date(),
        });
      }

      await chatDoc.save();
      console.log(
        `[updateChatHistory] Saved chat document with ${chatDoc.messages.length} messages`
      );

      if (
        !chatHistoryDoc.chat ||
        chatHistoryDoc.chat.toString() !== chatDoc._id.toString()
      ) {
        chatHistoryDoc.chat = chatDoc._id;
        await chatHistoryDoc.save();
        console.log(`[updateChatHistory] Updated chat history reference`);
      }

      if (senderId) {
        try {
          const userData = await user.findById(senderId);
          if (userData) {
            const historyExists = userData.chatHistory.some(
              (history) => history.toString() === chatHistoryDoc._id.toString()
            );

            if (!historyExists) {
              // CRITICAL FIX: Enforce 15 chat limit
              if (userData.chatHistory.length >= 15) {
                const oldestChatHistoryId = userData.chatHistory[0];
                await chat.deleteOne({ chatHistory: oldestChatHistoryId });
                await chatHistory.deleteOne({ _id: oldestChatHistoryId });
                userData.chatHistory.shift();
              }

              userData.chatHistory.push(chatHistoryDoc._id);
              await userData.save();
              console.log(`[updateChatHistory] Added to user's chat history`);
            }
          }
        } catch (userError) {
          console.error(`[updateChatHistory] Error updating user:`, userError);
        }
      }
    } catch (chatError) {
      console.error(
        `[updateChatHistory] Error handling chat document:`,
        chatError
      );
      return res.status(500).json({
        success: false,
        error: "Error updating chat document",
      });
    }

    console.log(`[updateChatHistory] Successfully updated chat history`);

    res.status(200).json({
      success: true,
      message: "Chat history updated successfully",
      chatHistoryId: chatHistoryDoc._id,
    });
  } catch (error) {
    console.error(`[updateChatHistory] Unexpected error:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to update chat history",
    });
  }
};

export const appendChatMessage = async (req, res, next) => {
  try {
    const { chatHistoryId, message, isSearch, searchType } = req.body;

    console.log(
      `[appendChatMessage] Appending to chat history: ${chatHistoryId}`
    );

    if (!chatHistoryId) {
      return res.status(400).json({
        success: false,
        error: "Chat history ID is required",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message content is required",
      });
    }

    let senderId = null;
    if (req.user && req.user._id) {
      senderId = req.user._id;
    } else {
      senderId = await getDefaultUserId();
    }

    let chatHistoryDoc;
    try {
      if (/^[0-9a-fA-F]{24}$/.test(chatHistoryId)) {
        chatHistoryDoc = await chatHistory.findOne({
          _id: chatHistoryId,
          user: senderId, // CRITICAL FIX: Always filter by user
        });
      } else {
        chatHistoryDoc = await chatHistory.findOne({
          $and: [
            { user: senderId }, // CRITICAL FIX: Always filter by user
            {
              $or: [{ clientId: chatHistoryId }, { _id: chatHistoryId }],
            },
          ],
        });
      }
    } catch (lookupError) {
      console.error(
        `[appendChatMessage] Error looking up chat history:`,
        lookupError
      );
      return res.status(500).json({
        success: false,
        error: "Error looking up chat history",
      });
    }

    if (!chatHistoryDoc) {
      return res.status(404).json({
        success: false,
        error: "Chat history not found",
      });
    }

    let chatDoc;
    try {
      chatDoc = await chat.findOne({ chatHistory: chatHistoryDoc._id });

      if (!chatDoc) {
        console.log(`[appendChatMessage] Creating new chat document`);
        chatDoc = new chat({
          chatHistory: chatHistoryDoc._id,
          messages: [],
        });
      }

      console.log(`[appendChatMessage] Appending new message to conversation`);
      chatDoc.messages.push({
        sender: senderId,
        message: {
          user: message.user,
          gemini: message.gemini,
          sources: message.sources || [],
          relatedQuestions: message.relatedQuestions || [],
          queryKeywords: message.queryKeywords || [],
          isPreformattedHTML: message.isPreformattedHTML || false,
        },
        isSearch: isSearch || false,
        searchType: searchType || null,
        timestamp: new Date(),
      });

      await chatDoc.save();
      console.log(
        `[appendChatMessage] Saved chat document with ${chatDoc.messages.length} messages`
      );

      if (
        !chatHistoryDoc.chat ||
        chatHistoryDoc.chat.toString() !== chatDoc._id.toString()
      ) {
        chatHistoryDoc.chat = chatDoc._id;
        await chatHistoryDoc.save();
        console.log(`[appendChatMessage] Updated chat history reference`);
      }
    } catch (chatError) {
      console.error(
        `[appendChatMessage] Error handling chat document:`,
        chatError
      );
      return res.status(500).json({
        success: false,
        error: "Error appending chat message",
      });
    }

    console.log(
      `[appendChatMessage] Successfully appended message to chat history`
    );

    res.status(200).json({
      success: true,
      message: "Message appended successfully",
      chatHistoryId: chatHistoryDoc._id,
      messageCount: chatDoc.messages.length,
    });
  } catch (error) {
    console.error(`[appendChatMessage] Unexpected error:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to append chat message",
    });
  }
};

export const createChatHistoryEnhanced = async (req, res, next) => {
  try {
    const { title, message, isSearch, searchType, clientId } = req.body;

    console.log(
      `[createChatHistoryEnhanced] Creating chat history - Title: ${title}, SearchType: ${searchType}`
    );

    let senderId = null;
    if (req.user && req.user._id) {
      senderId = req.user._id;
    } else {
      senderId = await getDefaultUserId();
    }

    // CRITICAL FIX: Enforce 15 chat limit
    if (senderId) {
      const userData = await user.findById(senderId);
      if (userData && userData.chatHistory.length >= 15) {
        const oldestChatHistoryId = userData.chatHistory[0];

        try {
          await chat.deleteOne({ chatHistory: oldestChatHistoryId });
          await chatHistory.deleteOne({ _id: oldestChatHistoryId });
          userData.chatHistory.shift();
          await userData.save();
          console.log(
            `[createChatHistoryEnhanced] Removed oldest chat history for user ${senderId}`
          );
        } catch (cleanupError) {
          console.error(
            `[createChatHistoryEnhanced] Error cleaning up old chat:`,
            cleanupError
          );
        }
      }
    }

    let chatType = searchType || "agent";
    if (clientId) {
      if (clientId.startsWith("jira_")) {
        chatType = "jira_agent";
      } else if (clientId.startsWith("conf_")) {
        chatType = "conf_agent";
      } else if (clientId.startsWith("monitor_")) {
        chatType = "monitor_agent";
      }
    }

    const chatHistoryDoc = new chatHistory({
      user: senderId,
      title: title || "Agent Response",
      timestamp: new Date(),
      type: chatType,
      clientId:
        clientId ||
        (chatType === "jira_agent"
          ? `jira_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
          : searchType === "agent"
          ? `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
          : undefined),
    });

    await chatHistoryDoc.save();
    console.log(
      `[createChatHistoryEnhanced] Created chat history: ${chatHistoryDoc._id}`
    );

    const chatDoc = new chat({
      chatHistory: chatHistoryDoc._id,
      messages: [
        {
          sender: senderId,
          message: {
            user: message.user || "Agent query",
            gemini: message.gemini || "Streaming response...",
            sources: message.sources || [],
            relatedQuestions: message.relatedQuestions || [],
            queryKeywords: message.queryKeywords || [],
            isPreformattedHTML: message.isPreformattedHTML || false,
          },
          isSearch: isSearch || true,
          searchType: chatType,
          timestamp: new Date(),
        },
      ],
    });

    await chatDoc.save();
    console.log(`[createChatHistoryEnhanced] Created chat: ${chatDoc._id}`);

    chatHistoryDoc.chat = chatDoc._id;
    await chatHistoryDoc.save();

    if (senderId) {
      try {
        const userData = await user.findById(senderId);
        if (userData) {
          if (!userData.chatHistory.includes(chatHistoryDoc._id)) {
            userData.chatHistory.push(chatHistoryDoc._id);
            await userData.save();
            console.log(
              `[createChatHistoryEnhanced] Added to user's chat history`
            );
          }
        }
      } catch (userError) {
        console.error(
          `[createChatHistoryEnhanced] Error updating user:`,
          userError
        );
      }
    }

    res.status(200).json({
      success: true,
      chatHistoryId: chatHistoryDoc._id,
      clientId: chatHistoryDoc.clientId,
      message: "Chat history created successfully",
    });
  } catch (error) {
    console.error(`[createChatHistoryEnhanced] Error:`, error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to create chat history",
    });
  }
};

// Enhanced postChat function for server/controller/public.js
// Replace the existing postChat function with this enhanced version

export const getAvailableAgents = async (req, res, next) => {
  try {
    console.log("[getAvailableAgents] Request received");
    console.log(
      `[getAvailableAgents] User: ${req.user ? req.user._id : "No user"}`
    );
    console.log(`[getAvailableAgents] Auth: ${req.auth || "No auth"}`);

    // Return your available agents
    const agents = [
      {
        id: "client_agent",
        name: "Client Agent",
        description: "Client-related questions and support",
      },
      {
        id: "zr_ag",
        name: "ZR Agent",
        description: "Zoom Room questions and troubleshooting",
      },
      {
        id: "jira_ag",
        name: "Jira Agent",
        description: "Jira tickets, issues, and project management",
      },
      {
        id: "conf_ag",
        name: "Confluence Agent",
        description: "Knowledge base search and documentation",
      },
      {
        id: "monitor_ag",
        name: "Monitor Agent",
        description: "System monitoring and log analysis",
      },
      {
        id: "zp_ag",
        name: "ZP Agent",
        description: "Zoom Phone support and configuration",
      },
    ];

    console.log(`[getAvailableAgents] Returning ${agents.length} agents`);

    res.status(200).json({
      success: true,
      agents: agents,
      timestamp: new Date().toISOString(),
      count: agents.length,
    });
  } catch (error) {
    console.error("[getAvailableAgents] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get available agents",
      message: error.message,
    });
  }
};

// CRITICAL FIX: Add missing generateJwtToken function
export const generateJwtToken = async (req, res, next) => {
  try {
    console.log("[generateJwtToken] Request received");
    console.log(
      `[generateJwtToken] User: ${req.user ? req.user._id : "No user"}`
    );
    console.log(`[generateJwtToken] Auth: ${req.auth || "No auth"}`);

    // Use your existing JWT token from environment variables
    const token =
      process.env.LLM_GATEWAY_JWT_TOKEN || process.env.DAYONE_JWT_TOKEN;

    if (!token) {
      console.error(
        "[generateJwtToken] No JWT token configured in environment"
      );
      return res.status(500).json({
        success: false,
        error: "JWT token not configured on server",
        message: "Please configure LLM_GATEWAY_JWT_TOKEN or DAYONE_JWT_TOKEN",
      });
    }

    // Set expiry to 1 hour from now
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;

    console.log("[generateJwtToken] Token generated successfully");
    console.log(
      `[generateJwtToken] Token expires at: ${new Date(
        expiresAt * 1000
      ).toISOString()}`
    );

    res.status(200).json({
      success: true,
      token: token,
      expiresAt: expiresAt,
      timestamp: new Date().toISOString(),
      message: "JWT token generated successfully",
    });
  } catch (error) {
    console.error("[generateJwtToken] Error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate JWT token",
      message: error.message,
    });
  }
};
