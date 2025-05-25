// server/controller/public.js - ENHANCED VERSION FOR JIRA AGENT CONVERSATIONS
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
        return chatHistory.findById(chatHistoryId);
      }
    })
    .then((chatHistory) => {
      if (!chatHistory) {
        const error = new Error("Chat History not found");
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
    .then((userData) => {
      if (!userData) {
        const error = new Error("No user found");
        error.statusCode = 403;
        throw error;
      }

      if (chatHistoryId.length < 5) {
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

export const getChatHistory = (req, res, next) => {
  user
    .findById(req.user._id)
    .populate({ path: "chatHistory" })
    .then((userData) => {
      if (!user) {
        const error = new Error("User Not Found");
        error.statusCode = 403;
        throw error;
      }

      let chatHistory;

      if (req.auth === "auth") {
        chatHistory = userData.chatHistory.reverse();
      } else {
        chatHistory = userData.chatHistory.reverse().slice(0, 5);
      }

      res.status(200).json({
        chatHistory: chatHistory,
        location: userData.location,
      });
    })
    .catch((error) => {
      if (!error.statusCode) {
        error.statusCode = 500;
      }
      next(error);
    });
};

// CRITICAL FIX: Enhanced postChat function with better Jira agent support
export const postChat = async (req, res, next) => {
  try {
    const chatHistoryId = req.body.chatHistoryId;

    if (!chatHistoryId) {
      return res.status(400).json({
        success: false,
        error: "Chat history ID is required",
      });
    }

    const userId = req.user?._id;
    const isNotAuthUser = req.auth === "noauth";

    console.log(
      `[postChat] Looking for chat history: ${chatHistoryId}, user: ${
        userId || "none"
      }`
    );

    // CRITICAL FIX: Enhanced agent chat detection with MongoDB ObjectId check
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(chatHistoryId);
    const isClientId = chatHistoryId && !isValidObjectId;
    const isAgentChat =
      chatHistoryId &&
      (chatHistoryId.startsWith("agent_") ||
        chatHistoryId.startsWith("jira_") ||
        chatHistoryId.includes("confluence") ||
        chatHistoryId.includes("monitor") ||
        chatHistoryId.includes("jira") ||
        isClientId);

    console.log(
      `[postChat] Chat lookup: ID=${chatHistoryId}, isValidObjectId=${isValidObjectId}, isClientId=${isClientId}, isAgentChat=${isAgentChat}`
    );

    let chatHistoryDoc;

    // CRITICAL FIX: Enhanced retry logic for newly created chats
    const maxRetries = 5;
    let retryCount = 0;

    while (!chatHistoryDoc && retryCount < maxRetries) {
      try {
        console.log(
          `[postChat] Search attempt ${retryCount + 1} for: ${chatHistoryId}`
        );

        if (isValidObjectId) {
          // Strategy 1: Direct MongoDB ObjectId lookup (most common case)
          console.log(
            `[postChat] Trying MongoDB ObjectId lookup: ${chatHistoryId}`
          );
          chatHistoryDoc = await chatHistory
            .findById(chatHistoryId)
            .populate("chat");

          if (chatHistoryDoc) {
            console.log(
              `[postChat] Found by MongoDB ObjectId: ${chatHistoryDoc._id}`
            );
          }
        }

        // Strategy 2: Client ID lookup for agent chats (including Jira agent)
        if (!chatHistoryDoc && isClientId) {
          console.log(`[postChat] Trying clientId lookup: ${chatHistoryId}`);
          chatHistoryDoc = await chatHistory
            .findOne({ clientId: chatHistoryId })
            .populate("chat");

          if (chatHistoryDoc) {
            console.log(`[postChat] Found by clientId: ${chatHistoryDoc._id}`);
          }
        }

        // Strategy 3: Search by title patterns for agent chats (including Jira)
        if (!chatHistoryDoc && isAgentChat) {
          console.log(
            `[postChat] Trying pattern-based lookup for: ${chatHistoryId}`
          );

          // Look for recent agent chats with similar patterns
          const searchPatterns = [
            {
              $or: [
                {
                  clientId: new RegExp(
                    chatHistoryId.replace(/[_-]/g, "\\s*"),
                    "i"
                  ),
                },
                {
                  title: new RegExp(
                    chatHistoryId.replace(/[_-]/g, "\\s*"),
                    "i"
                  ),
                },
              ],
              timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }, // Last 10 minutes
            },
            {
              type: {
                $in: ["agent", "conf_agent", "monitor_agent", "jira_agent"],
              },
              timestamp: { $gte: new Date(Date.now() - 10 * 60 * 1000) }, // Last 10 minutes
            },
          ];

          for (const pattern of searchPatterns) {
            chatHistoryDoc = await chatHistory
              .findOne(pattern)
              .sort({ timestamp: -1, createdAt: -1 })
              .populate("chat");

            if (chatHistoryDoc) {
              console.log(`[postChat] Found match with pattern:`, pattern);
              break;
            }
          }
        }

        // Strategy 4: Fallback search for any recent chat by the user
        if (!chatHistoryDoc && userId) {
          console.log(`[postChat] Trying user-based recent chat lookup`);

          const recentUserChats = await chatHistory
            .find({
              user: userId,
              timestamp: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
            })
            .sort({ timestamp: -1, createdAt: -1 })
            .limit(5)
            .populate("chat");

          if (recentUserChats.length > 0) {
            // Try to find exact match first
            const exactMatch = recentUserChats.find(
              (chat) =>
                chat._id.toString() === chatHistoryId ||
                chat.clientId === chatHistoryId
            );

            chatHistoryDoc = exactMatch || recentUserChats[0];
            console.log(
              `[postChat] Using recent user chat: ${chatHistoryDoc._id}`
            );
          }
        }

        // Strategy 5: Broad search for very new chats (within last minute)
        if (!chatHistoryDoc && isValidObjectId) {
          console.log(`[postChat] Trying broad recent search for new chat`);

          chatHistoryDoc = await chatHistory
            .findOne({
              _id: chatHistoryId,
              timestamp: { $gte: new Date(Date.now() - 2 * 60 * 1000) }, // Last 2 minutes
            })
            .populate("chat");

          if (chatHistoryDoc) {
            console.log(
              `[postChat] Found in broad recent search: ${chatHistoryDoc._id}`
            );
          }
        }

        // If found, break out of retry loop
        if (chatHistoryDoc) {
          break;
        }

        // If not found and we have retries left, wait before retrying
        if (retryCount < maxRetries - 1) {
          console.log(
            `[postChat] Chat not found, waiting 2 seconds before retry ${
              retryCount + 2
            }`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        retryCount++;
      } catch (innerErr) {
        console.error(
          `[postChat] Error in lookup attempt ${retryCount + 1}:`,
          innerErr
        );
        retryCount++;

        // If we have retries left, wait before retrying
        if (retryCount < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    if (!chatHistoryDoc) {
      console.log(
        `[postChat] No chat data found after ${maxRetries} attempts for ID: ${chatHistoryId}`
      );
      return res.status(404).json({
        success: false,
        error: `Chat history not found after ${maxRetries} attempts: ${chatHistoryId}`,
        chats: [],
        debug: {
          searchedId: chatHistoryId,
          isAgentChat,
          isClientId,
          isValidObjectId,
          attempts: maxRetries,
          timestamp: new Date().toISOString(),
        },
      });
    }

    console.log(
      `[postChat] Found chat history: ${chatHistoryDoc._id}, type: ${
        chatHistoryDoc.type || "standard"
      }`
    );

    // CRITICAL FIX: Enhanced message processing with better error handling for Jira agent
    if (chatHistoryDoc.chat && chatHistoryDoc.chat.messages) {
      console.log(
        `[postChat] Found chat with ${chatHistoryDoc.chat.messages.length} messages`
      );

      try {
        // Process ALL messages in the conversation
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
            console.error(`[postChat] Error converting message ${index}:`, err);
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

        console.log(
          `[postChat] Successfully processed ${messagesArray.length} messages for chat ${chatHistoryDoc._id}`
        );

        return res.status(200).json({
          success: true,
          chatHistory: chatHistoryDoc._id.toString(),
          chats: messagesArray,
          chatType: chatHistoryDoc.type || "standard",
          clientId: chatHistoryDoc.clientId || null,
          foundAfterRetries: retryCount,
        });
      } catch (err) {
        console.error(`[postChat] Error serializing chat data:`, err);
        return res.status(500).json({
          success: false,
          error: "Error processing chat data",
          chatHistory: chatHistoryDoc._id.toString(),
          chats: [],
        });
      }
    } else {
      // Handle case where chat or messages might not exist
      console.log(
        `[postChat] No messages found for chat history: ${chatHistoryDoc._id}`
      );
      return res.status(200).json({
        success: true,
        chatHistory: chatHistoryDoc._id.toString(),
        chats: [],
        chatType: chatHistoryDoc.type || "standard",
        clientId: chatHistoryDoc.clientId || null,
        foundAfterRetries: retryCount,
      });
    }
  } catch (err) {
    console.error(`[postChat] Unexpected error:`, err);
    return res.status(500).json({
      success: false,
      error: err.message || "Error retrieving chat",
      chatHistory: req.body.chatHistoryId || "unknown",
      chats: [],
    });
  }
};

// Add a dedicated GET route endpoint for backward compatibility
export const getSingleChat = async (req, res, next) => {
  try {
    const chatId = req.params.id;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        error: "Chat ID is required",
      });
    }

    // Use the same logic as postChat but with the params in the request body
    console.log(`Redirecting getSingleChat ${chatId} to postChat logic`);

    // Call the same function but with the params in the request body
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

// API endpoint to create a new chat history entry
export const createChatHistory = async (req, res, next) => {
  try {
    const { title, message, isSearch, searchType } = req.body;

    // Create a new chat history document
    const chatHistoryDoc = new chatHistory({
      user: req.user ? req.user._id : null,
      title: title || "Agent Response",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await chatHistoryDoc.save();

    // Create a new chat entry
    const chatDoc = new chat({
      chatHistory: chatHistoryDoc._id,
      messages: [
        {
          sender: req.user ? req.user._id : null,
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

    // Update chat history reference
    chatHistoryDoc.chat = chatDoc._id;
    await chatHistoryDoc.save();

    // Add to user"s chat history if user exists
    if (req.user && req.user.chatHistory) {
      if (req.user.chatHistory.indexOf(chatHistoryDoc._id) === -1) {
        req.user.chatHistory.push(chatHistoryDoc._id);
        await req.user.save();
      }
    }

    // Return success with chat history ID
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
  const userId = req.user._id;

  if (!chatHistoryId) {
    return res
      .status(400)
      .json({ success: false, message: "Chat history ID is required." });
  }

  try {
    // Find the chat history to ensure it belongs to the user
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

    // Delete the associated chat messages
    await chat.deleteOne({ chatHistory: chatHistoryId });

    // Delete the chat history itself
    await chatHistory.deleteOne({ _id: chatHistoryId, user: userId });

    // Remove the chat history reference from the user"s document
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

// CRITICAL FIX: Enhanced updateChatHistory for Jira agent conversations
export const updateChatHistory = async (req, res, next) => {
  try {
    const { chatHistoryId, message } = req.body;

    console.log(`[updateChatHistory] Updating chat history: ${chatHistoryId}`);
    console.log(`[updateChatHistory] Message data:`, {
      hasUser: !!message?.user,
      hasGemini: !!message?.gemini,
      geminiLength: message?.gemini?.length || 0,
    });

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

    // CRITICAL FIX: Get sender ID with fallback
    let senderId = null;
    if (req.user && req.user._id) {
      senderId = req.user._id;
    } else {
      senderId = await getDefaultUserId();
      console.log(`[updateChatHistory] Using default user ID: ${senderId}`);
    }

    // CRITICAL FIX: Handle both MongoDB ObjectId and client-generated IDs
    let chatHistoryDoc;

    try {
      if (/^[0-9a-fA-F]{24}$/.test(chatHistoryId)) {
        // MongoDB ObjectId format
        console.log(
          `[updateChatHistory] Looking up MongoDB ID: ${chatHistoryId}`
        );
        chatHistoryDoc = await chatHistory.findById(chatHistoryId);
      } else {
        // Client-generated ID format (like agent_timestamp_random or jira_timestamp_random)
        console.log(
          `[updateChatHistory] Looking up client ID: ${chatHistoryId}`
        );
        chatHistoryDoc = await chatHistory.findOne({
          $or: [
            { clientId: chatHistoryId },
            {
              title: {
                $regex: chatHistoryId.split("_").slice(-1)[0],
                $options: "i",
              },
            },
          ],
        });

        // If still not found, try to find by partial matching
        if (!chatHistoryDoc) {
          console.log(
            `[updateChatHistory] Trying partial match for: ${chatHistoryId}`
          );
          const recentAgentChats = await chatHistory
            .find({
              type: {
                $in: ["agent", "conf_agent", "monitor_agent", "jira_agent"],
              },
              timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Within last 24 hours
            })
            .sort({ timestamp: -1 })
            .limit(5);

          if (recentAgentChats.length > 0) {
            // Use the most recent agent chat
            chatHistoryDoc = recentAgentChats[0];
            console.log(
              `[updateChatHistory] Using recent agent chat: ${chatHistoryDoc._id}`
            );
          }
        }
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

      // CRITICAL FIX: Create new chat history if not found
      try {
        // Determine chat type based on chatHistoryId
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
          clientId: chatHistoryId, // Store the client ID for future lookups
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

    // Find or create the associated chat document
    let chatDoc;

    try {
      chatDoc = await chat.findOne({ chatHistory: chatHistoryDoc._id });

      if (!chatDoc) {
        console.log(`[updateChatHistory] Creating new chat document`);
        // Create new chat document if it doesn't exist
        chatDoc = new chat({
          chatHistory: chatHistoryDoc._id,
          messages: [],
        });
      }

      // CRITICAL FIX: Handle message updates properly for conversation continuation
      if (chatDoc.messages.length > 0) {
        const lastMessage = chatDoc.messages[chatDoc.messages.length - 1];

        // Check if we should update the last message or add a new one
        const shouldUpdateLastMessage =
          lastMessage.message.user === message.user &&
          (lastMessage.message.gemini === "Streaming response..." ||
            lastMessage.message.gemini === "Connecting to Jira..." ||
            lastMessage.message.gemini.includes("Connecting") ||
            lastMessage.message.gemini.length < 50); // Likely a placeholder

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
          // Add new message for conversation continuation
          chatDoc.messages.push({
            sender: senderId, // CRITICAL FIX: Always provide sender ID
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
        // No messages exist, add the first one
        chatDoc.messages.push({
          sender: senderId, // CRITICAL FIX: Always provide sender ID
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

      // Save the updated chat document
      await chatDoc.save();
      console.log(
        `[updateChatHistory] Saved chat document with ${chatDoc.messages.length} messages`
      );

      // Update the chat history reference if needed
      if (
        !chatHistoryDoc.chat ||
        chatHistoryDoc.chat.toString() !== chatDoc._id.toString()
      ) {
        chatHistoryDoc.chat = chatDoc._id;
        await chatHistoryDoc.save();
        console.log(`[updateChatHistory] Updated chat history reference`);
      }

      // CRITICAL FIX: Update user's chat history if user exists
      if (senderId) {
        try {
          const userData = await user.findById(senderId);
          if (userData) {
            const historyExists = userData.chatHistory.some(
              (history) => history.toString() === chatHistoryDoc._id.toString()
            );

            if (!historyExists) {
              userData.chatHistory.push(chatHistoryDoc._id);
              await userData.save();
              console.log(`[updateChatHistory] Added to user's chat history`);
            }
          }
        } catch (userError) {
          console.error(`[updateChatHistory] Error updating user:`, userError);
          // Continue even if user update fails
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

// CRITICAL FIX: Enhanced appendChatMessage API for conversation continuation
export const appendChatMessage = async (req, res, next) => {
  try {
    const { chatHistoryId, message, isSearch, searchType } = req.body;

    console.log(
      `[appendChatMessage] Appending to chat history: ${chatHistoryId}`
    );
    console.log(`[appendChatMessage] Message data:`, {
      hasUser: !!message?.user,
      hasGemini: !!message?.gemini,
      isSearch,
      searchType,
    });

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

    // CRITICAL FIX: Get sender ID with fallback
    let senderId = null;
    if (req.user && req.user._id) {
      senderId = req.user._id;
    } else {
      senderId = await getDefaultUserId();
      console.log(`[appendChatMessage] Using default user ID: ${senderId}`);
    }

    // Find the chat history
    let chatHistoryDoc;
    try {
      if (/^[0-9a-fA-F]{24}$/.test(chatHistoryId)) {
        chatHistoryDoc = await chatHistory.findById(chatHistoryId);
      } else {
        chatHistoryDoc = await chatHistory.findOne({
          $or: [{ clientId: chatHistoryId }, { _id: chatHistoryId }],
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

    // Find the associated chat document
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

      // CRITICAL FIX: Always append new message to conversation
      console.log(`[appendChatMessage] Appending new message to conversation`);
      chatDoc.messages.push({
        sender: senderId, // CRITICAL FIX: Always provide sender ID
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

      // Save the updated chat document
      await chatDoc.save();
      console.log(
        `[appendChatMessage] Saved chat document with ${chatDoc.messages.length} messages`
      );

      // Update the chat history reference if needed
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

// CRITICAL FIX: Enhanced createChatHistoryEnhanced for better Jira agent support
export const createChatHistoryEnhanced = async (req, res, next) => {
  try {
    const { title, message, isSearch, searchType, clientId } = req.body;

    console.log(
      `[createChatHistoryEnhanced] Creating chat history - Title: ${title}, SearchType: ${searchType}`
    );

    // CRITICAL FIX: Get sender ID with fallback
    let senderId = null;
    if (req.user && req.user._id) {
      senderId = req.user._id;
    } else {
      senderId = await getDefaultUserId();
      console.log(
        `[createChatHistoryEnhanced] Using default user ID: ${senderId}`
      );
    }

    // Determine appropriate chat type based on searchType or clientId
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

    // Create a new chat history document
    const chatHistoryDoc = new chatHistory({
      user: senderId,
      title: title || "Agent Response",
      timestamp: new Date(),
      type: chatType,
      // Use provided clientId or generate one based on type
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

    // Create a new chat entry
    const chatDoc = new chat({
      chatHistory: chatHistoryDoc._id,
      messages: [
        {
          sender: senderId, // CRITICAL FIX: Always provide sender ID
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

    // Update chat history reference
    chatHistoryDoc.chat = chatDoc._id;
    await chatHistoryDoc.save();

    // Add to user's chat history if user exists
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
        // Continue even if user update fails
      }
    }

    // Return success with chat history ID
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
