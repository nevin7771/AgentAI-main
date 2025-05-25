import { user } from "../model/user.js";
import { chat } from "../model/chat.js";
import { chatHistory } from "../model/chatHistory.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Error } from "mongoose";

export const getGeminiHome = (req, res, next) => {
  res.status(200).json({ message: "Welcome to Gemini Ai Api" });
};

// post gemini data add to db condition

// if chatHistoryId -> check old chatHistory else create new chatHistory

// if chatHistoryId -> push old chat -> create new chat

// add chat to chatHistory only first one

// add chatHistory to user

let b = 0;

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

      b += 1;

      console.log("new chat ", b);

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

let c = 0;

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
      c += 1;
      console.log("chat history", c);

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

let a = 0;

export const postChat = async (req, res, next) => {
  try {
    const chatHistoryId = req.body.chatHistoryId;

    // If no chatHistoryId is provided, return an error
    if (!chatHistoryId) {
      return res.status(400).json({
        success: false,
        error: "Chat history ID is required",
      });
    }

    const userId = req.user?._id;
    const isNotAuthUser = req.auth === "noauth";

    console.log(
      "Looking for chat history:",
      chatHistoryId,
      "user:",
      userId || "none"
    );

    // Check if this is an agent chat or client-generated ID
    const isClientId =
      chatHistoryId && !/^[0-9a-fA-F]{24}$/.test(chatHistoryId);
    const isAgentChat = chatHistoryId && chatHistoryId.startsWith("agent_");

    console.log(
      `Chat lookup: ID=${chatHistoryId}, isClientId=${isClientId}, isAgentChat=${isAgentChat}`
    );

    let chatHistoryDoc;

    try {
      // CRITICAL FIX: Enhanced lookup logic for both regular and agent chats
      if (isAgentChat || isClientId) {
        // Try to find by clientId first
        chatHistoryDoc = await chatHistory
          .findOne({
            clientId: chatHistoryId,
          })
          .populate("chat");

        if (!chatHistoryDoc) {
          // Try to find by partial title match
          chatHistoryDoc = await chatHistory
            .findOne({
              $or: [
                {
                  title: {
                    $regex: chatHistoryId.split("_")[1] || chatHistoryId,
                    $options: "i",
                  },
                },
                { type: "agent" },
              ],
            })
            .populate("chat");

          if (!chatHistoryDoc) {
            // Last attempt - find most recent agent chat
            const recentAgentChats = await chatHistory
              .find({
                type: { $in: ["agent", "conf_agent", "monitor_agent"] },
                timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
              })
              .sort({ timestamp: -1 })
              .limit(5)
              .populate("chat");

            if (recentAgentChats.length > 0) {
              chatHistoryDoc = recentAgentChats[0];
              console.log(
                `No exact match found - using most recent agent chat: ${chatHistoryDoc._id}`
              );
            }
          }
        }
      } else {
        // Regular MongoDB ObjectId lookup
        if (isNotAuthUser) {
          // For non-auth users, find from most recent chats
          const allowedHistories = await chatHistory
            .find({ user: userId })
            .sort({ timestamp: -1 })
            .limit(10);

          const allowedIds = allowedHistories.map((h) => h._id.toString());
          if (!allowedIds.includes(chatHistoryId)) {
            console.log(
              "ChatHistoryId not in allowed list:",
              chatHistoryId,
              "Allowed:",
              allowedIds
            );
            return res.status(404).json({
              success: false,
              error: `Chat history not found: ${chatHistoryId}`,
              chats: [],
            });
          }
        }

        chatHistoryDoc = await chatHistory
          .findOne({
            $or: [
              { _id: chatHistoryId, user: userId },
              { _id: chatHistoryId }, // Fallback for public chats
            ],
          })
          .populate("chat");
      }

      if (!chatHistoryDoc) {
        console.log("No chat data found for ID:", chatHistoryId);
        return res.status(404).json({
          success: false,
          error: `Chat history not found: ${chatHistoryId}`,
          chats: [],
        });
      }

      console.log("Found chat history:", chatHistoryDoc._id);

      // CRITICAL FIX: Enhanced message processing to return ALL messages
      if (chatHistoryDoc.chat && chatHistoryDoc.chat.messages) {
        console.log(
          "Found chat with messages:",
          chatHistoryDoc.chat.messages.length
        );

        try {
          // CRITICAL FIX: Process ALL messages in the conversation
          const messagesArray = chatHistoryDoc.chat.messages.map(
            (msg, index) => {
              try {
                const msgObj = msg.toObject ? msg.toObject() : msg;

                // CRITICAL FIX: Ensure proper message structure
                return {
                  _id: msg._id
                    ? msg._id.toString()
                    : `msg_${index}_${Date.now()}`,
                  timestamp: msg.timestamp || new Date().toISOString(),
                  isSearch: msg.isSearch || false,
                  searchType: msg.searchType || null,
                  sender: msg.sender ? msg.sender.toString() : null,
                  message: {
                    user: msgObj.message?.user || "",
                    gemini: msgObj.message?.gemini || "",
                    sources: msgObj.message?.sources || [],
                    relatedQuestions: msgObj.message?.relatedQuestions || [],
                    queryKeywords: msgObj.message?.queryKeywords || [],
                    isPreformattedHTML:
                      msgObj.message?.isPreformattedHTML || false,
                  },
                };
              } catch (err) {
                console.error("Error converting message to object:", err);
                return {
                  _id: `error_${index}_${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  isSearch: false,
                  searchType: null,
                  sender: null,
                  message: {
                    user: "",
                    gemini: "Error loading message",
                    sources: [],
                    relatedQuestions: [],
                    queryKeywords: [],
                    isPreformattedHTML: false,
                  },
                };
              }
            }
          );

          console.log(
            `[postChat] Processed ${messagesArray.length} messages for chat history ${chatHistoryDoc._id}`
          );

          return res.status(200).json({
            success: true,
            chatHistory: chatHistoryDoc._id.toString(),
            chats: messagesArray, // CRITICAL FIX: Return ALL messages
          });
        } catch (err) {
          console.error("Error serializing chat data:", err);
          return res.status(500).json({
            success: false,
            error: "Error processing chat data",
            chatHistory: chatHistoryDoc._id.toString(),
            chats: [],
          });
        }
      } else {
        // Handle case where chat or messages might not exist
        console.log("No messages found for chat history:", chatHistoryDoc._id);
        return res.status(200).json({
          success: true,
          chatHistory: chatHistoryDoc._id.toString(),
          chats: [], // Return empty array but indicate success
        });
      }
    } catch (innerErr) {
      console.error("Error retrieving chat data:", innerErr);
      return res.status(500).json({
        success: false,
        error: innerErr.message || "Error retrieving chat data",
        chatHistory: chatHistoryId,
        chats: [],
      });
    }
  } catch (err) {
    console.error("Error retrieving chat:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Error retrieving chat",
      chatHistory: chatHistoryId,
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

let d = 0;

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
        // Client-generated ID format (like agent_timestamp_random)
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
              type: { $in: ["agent", "conf_agent", "monitor_agent"] },
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
        chatHistoryDoc = new chatHistory({
          user: senderId,
          title: message.user
            ? message.user.substring(0, 50)
            : "Agent Response",
          timestamp: new Date(),
          type: "agent",
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
            lastMessage.message.gemini === "Connecting to Day One API..." ||
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

// CRITICAL FIX: Add appendChatMessage API for conversation continuation
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

// CRITICAL FIX: Enhanced createChatHistory for better streaming support
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

    // Create a new chat history document
    const chatHistoryDoc = new chatHistory({
      user: senderId,
      title: title || "Agent Response",
      timestamp: new Date(),
      type: searchType || "agent",
      // Use provided clientId or generate one
      clientId:
        clientId ||
        (searchType === "agent"
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
          searchType: searchType || "agent",
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
