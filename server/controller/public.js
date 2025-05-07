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
        error: "Chat history ID is required"
      });
    }

    const userId = req.user?._id;
    const isNotAuthUser = req.auth === "noauth";

    console.log("Looking for chat history:", chatHistoryId, "user:", userId || "none");

    // Check if this is an agent chat or client-generated ID
    const isClientId = chatHistoryId && !(/^[0-9a-fA-F]{24}$/.test(chatHistoryId));
    const isAgentChat = chatHistoryId && chatHistoryId.startsWith("agent_");
    
    console.log(`Chat lookup: ID=${chatHistoryId}, isClientId=${isClientId}, isAgentChat=${isAgentChat}`);
    
    // For agent chats, we need special handling
    if (isAgentChat) {
      // Try to find the chat first by clientId
      let agentChatDoc = await chatHistory.findOne({ clientId: chatHistoryId });
      
      // If not found but looks like a client ID, try a pattern search
      if (!agentChatDoc && isClientId) {
        agentChatDoc = await chatHistory.findOne({ 
          type: "agent",
          title: { $regex: chatHistoryId.split('_')[1], $options: 'i' } 
        });
        
        if (!agentChatDoc) {
          // Last attempt - try any type="agent" document
          const recentAgentChats = await chatHistory.find({ type: "agent" })
            .sort({ timestamp: -1 })
            .limit(3);
            
          if (recentAgentChats.length > 0) {
            agentChatDoc = recentAgentChats[0]; // Just use the most recent one
            console.log(`No exact match found - using most recent agent chat: ${agentChatDoc._id}`);
          }
        }
      }
      
      if (agentChatDoc) {
        console.log(`Found agent chat: ${agentChatDoc._id}, clientId: ${agentChatDoc.clientId}`);
        
        // Populate the chat messages
        await agentChatDoc.populate('chat');
        
        return res.status(200).json({
          chatHistory: agentChatDoc._id,
          chats: agentChatDoc.chat?.messages || []
        });
      } else {
        // For agent chats, return 404 to handle properly
        return res.status(404).json({
          success: false,
          error: `Agent chat not found: ${chatHistoryId}`,
          chats: []
        });
      }
    }
  
    // For regular chats, use the existing logic
    let query;
    if (isNotAuthUser) {
      // For non-auth users, find from most recent chats
      query = chatHistory.find({ user: userId })
        .sort({ timestamp: -1 })
      .limit(10) // Increased limit to make it more likely to find client IDs
      .then(histories => {
        // Check if the requested chat history is in the allowed list
        if (chatHistoryId) {
          if (isClientId) {
            // For client IDs, search by clientId first, then fallback to title
            console.log("Looking for client ID:", chatHistoryId);
            return chatHistory.findOne({
              user: userId,
              $or: [
                { clientId: chatHistoryId },
                { title: { $regex: chatHistoryId, $options: 'i' } }
              ]
            }).populate('chat');
          } else {
            // For MongoDB IDs, check if in allowed list
            const allowedIds = histories.map(h => h._id.toString());
            if (!allowedIds.includes(chatHistoryId)) {
              console.log("ChatHistoryId not in allowed list:", chatHistoryId, "Allowed:", allowedIds);
              // Return 404 to handle properly on client
              return null;
            }
            return chatHistory.findOne({ _id: chatHistoryId, user: userId }).populate('chat');
          }
        } else if (histories.length > 0) {
          // If no specific ID, just return the most recent one
          return chatHistory.findOne({ _id: histories[0]._id }).populate('chat');
        } else {
          return null;
        }
      });
  } else {
    // For authenticated users - with more flexible lookup
    if (isClientId) {
      // For client IDs, search by clientId field directly
      console.log(`[Auth] Looking for client ID: ${chatHistoryId}`);
      query = chatHistory.findOne({
        $or: [
          { clientId: chatHistoryId, user: userId },
          { title: chatHistoryId, user: userId },
          { clientId: chatHistoryId } // Fallback: try any user if this is an agent chat
        ]
      }).populate('chat');
    } else {
      // For MongoDB IDs, directly find by ID
      query = chatHistory.findOne({ 
        $or: [
          { _id: chatHistoryId, user: userId },
          { _id: chatHistoryId } // Fallback: try any user if this is a public chat
        ]
      }).populate('chat');
    }
  }

  try {
    const chatData = await query;
    
    if (!chatData) {
      // Return 404 to handle properly on client
      console.log("No chat data found for ID:", chatHistoryId);
      return res.status(404).json({
        success: false,
        error: `Chat history not found: ${chatHistoryId}`,
        chats: []
      });
    }

    a += 1;
    console.log("Found chat history:", a, chatData._id);

    // Check if chat exists and has messages
    if (chatData.chat && chatData.chat.messages) {
      console.log("Found chat with messages:", chatData.chat.messages.length);
      try {
        // Convert MongoDB documents to plain objects for JSON response
        const messagesArray = chatData.chat.messages.map(msg => {
          try {
            const msgObj = msg.toObject ? msg.toObject() : msg;
            return {
              ...msgObj,
              _id: msg._id.toString(),
              timestamp: msg.timestamp,
              isSearch: msg.isSearch || false,
              searchType: msg.searchType || null
            };
          } catch (err) {
            console.error("Error converting message to object:", err);
            return msg;
          }
        });
        
        return res.status(200).json({
          success: true,
          chatHistory: chatData._id.toString(),
          chats: messagesArray
        });
      } catch (err) {
        console.error("Error serializing chat data:", err);
        return res.status(500).json({
          success: false,
          error: "Error processing chat data",
          chatHistory: chatData._id.toString()
        });
      }
    } else {
      // Handle case where chat or messages might not exist
      console.log("No messages found for chat history:", chatData._id);
      return res.status(404).json({
        success: false,
        error: `Chat exists but has no messages: ${chatData._id}`,
        chats: []
      });
    }
  } catch (innerErr) {
    console.error("Error retrieving chat data:", innerErr);
    return res.status(500).json({
      success: false,
      error: innerErr.message || "Error retrieving chat data",
      chatHistory: chatHistoryId,
      chats: []
    });
    }
  } catch (err) {
    console.error("Error retrieving chat:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Error retrieving chat",
      chatHistory: chatHistoryId,
      chats: []
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
        error: "Chat ID is required"
      });
    }
    
    // Use the same logic as postChat but for a GET endpoint
    // This is to support the legacy /getsinglechat/:id endpoint
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
      chats: []
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
      title: title || 'Agent Response',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await chatHistoryDoc.save();
    
    // Create a new chat entry
    const chatDoc = new chat({
      chatHistory: chatHistoryDoc._id,
      messages: [
        {
          sender: req.user ? req.user._id : null,
          message: {
            user: message.user || 'Agent query',
            gemini: message.gemini || 'No response',
          },
          isSearch: isSearch || true,
          searchType: searchType || 'agent',
        },
      ],
    });
    
    await chatDoc.save();
    
    // Update chat history reference
    chatHistoryDoc.chat = chatDoc._id;
    await chatHistoryDoc.save();
    
    // Add to user's chat history if user exists
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
      message: 'Chat history created successfully'
    });
  } catch (error) {
    console.error('Error creating chat history:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create chat history'
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
      location = `${data.address.city}, ${data.address.state}, ${data.address.country}`;

      return user.findById(req.user._id);
    })
    .then((user) => {
      if (!user) {
        const error = new Error("User Not Found");
        error.statusCode = 403;
        throw error;
      }

      user.location = location;

      return user.save();
    })
    .then((result) => {
      if (!result) {
        const error = new Error("No Result");
        error.statusCode = 403;
        throw error;
      }
      d += 1;
      console.log("location", d);
      res.status(200).json({ location: location });
    })
    .catch((error) => {
      if (!res.statusCode) {
        res.statusCode = 500;
      }
      next(error);
    });
};
