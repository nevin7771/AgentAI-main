// public/src/store/chat.js - CRITICAL FIX: Prevent page refresh during streaming
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  chats: [],
  newChat: false,
  isLoader: false,
  isSubmitting: false,
  lastQuery: "",
  recentChat: [],
  previousChat: [],
  chatHistoryId: null,
  geminiBackendOption: "Gemini",
  suggestPrompt: "",
  showScrollBottom: false,
  streamingInProgress: false, // CRITICAL FIX: Track streaming state
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    loaderHandler(state) {
      state.isLoader = !state.isLoader;
    },

    chatStart(state, action) {
      const useInput = action.payload.useInput;

      // CRITICAL FIX: Enhanced unique ID generation
      const newMessageId =
        useInput.id ||
        useInput.streamingId ||
        `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Log for debugging
      console.log(
        `[chatStart] Processing message - ID: ${newMessageId}, streamingId: ${useInput.streamingId}, isLoader: ${useInput.isLoader}`
      );

      if (
        useInput.isLoader === "streaming" ||
        useInput.isLoader === "partial"
      ) {
        // CRITICAL FIX: For streaming messages, always check by streamingId first
        const existingStreamingMessage = state.chats.find(
          (chat) => chat.streamingId === useInput.streamingId
        );

        if (existingStreamingMessage) {
          console.log(
            `[chatStart] Updating existing streaming message: ${useInput.streamingId}`
          );
          existingStreamingMessage.gemini = useInput.gemini;
          existingStreamingMessage.isLoader = useInput.isLoader;
          existingStreamingMessage.timestamp = new Date().toISOString();
          return;
        }
      }

      // Add new chat message with enhanced logging
      console.log(
        `[chatStart] Adding new message: ${newMessageId}, streamingId: ${useInput.streamingId}`
      );
      state.chats.push({
        id: newMessageId,
        user: useInput.user || "",
        gemini: useInput.gemini || "",
        isLoader: useInput.isLoader || "no",
        isSearch: useInput.isSearch || false,
        searchType: useInput.searchType || null,
        usedCache: useInput.usedCache || false,
        queryKeywords: useInput.queryKeywords || [],
        sources: useInput.sources || [],
        relatedQuestions: useInput.relatedQuestions || [],
        isPreformattedHTML: useInput.isPreformattedHTML || false,
        error: useInput.error || null,
        streamingId: useInput.streamingId || null, // CRITICAL: Ensure streamingId is preserved
        newChat:
          useInput.newChat !== undefined
            ? useInput.newChat
            : !state.chatHistoryId,
        timestamp: useInput.timestamp || new Date().toISOString(),
      });

      // Update state flags
      if (useInput.isLoader === "yes" || useInput.isLoader === "streaming") {
        state.isSubmitting = true;
        state.streamingInProgress = true; // CRITICAL FIX: Track streaming
      }
      state.newChat = false;
    },

    // CRITICAL FIX: Enhanced updateStreamingChat to prevent page refresh
    updateStreamingChat(state, action) {
      const {
        streamingId,
        content,
        isComplete,
        sources,
        relatedQuestions,
        error,
      } = action.payload;

      console.log(
        `[updateStreamingChat] Looking for streamingId: ${streamingId} in ${state.chats.length} messages`
      );

      // CRITICAL FIX: Multiple search strategies with performance optimization
      let messageIndex = -1;

      // Strategy 1: Direct streamingId match (most efficient)
      messageIndex = state.chats.findIndex(
        (chat) => chat.streamingId === streamingId
      );

      // Strategy 2: ID match (sometimes streamingId becomes the ID)
      if (messageIndex === -1) {
        messageIndex = state.chats.findIndex((chat) => chat.id === streamingId);
      }

      // Strategy 3: Find most recent streaming message (fallback)
      if (messageIndex === -1) {
        console.log(
          `[updateStreamingChat] Direct match failed, looking for recent streaming message`
        );
        messageIndex = state.chats.findIndex(
          (chat) => chat.isLoader === "streaming" || chat.isLoader === "yes"
        );
      }

      // Strategy 4: Find last message if it's a loading/streaming message
      if (messageIndex === -1 && state.chats.length > 0) {
        const lastMessage = state.chats[state.chats.length - 1];
        if (
          lastMessage.isLoader === "streaming" ||
          lastMessage.isLoader === "yes"
        ) {
          messageIndex = state.chats.length - 1;
          console.log(
            `[updateStreamingChat] Using last message as fallback: ${lastMessage.id}`
          );
        }
      }

      if (messageIndex !== -1) {
        console.log(
          `[updateStreamingChat] Found message at index: ${messageIndex}, updating content`
        );

        // CRITICAL FIX: Optimize content updates to prevent unnecessary re-renders
        const existingMessage = state.chats[messageIndex];

        // Only update if content actually changed
        if (existingMessage.gemini !== content) {
          existingMessage.gemini = content;
          existingMessage.timestamp = new Date().toISOString();
        }

        // Ensure streamingId is preserved
        if (!existingMessage.streamingId && streamingId) {
          existingMessage.streamingId = streamingId;
        }

        if (error) {
          // Handle streaming errors
          existingMessage.error = error;
          existingMessage.isLoader = "no";
          existingMessage.gemini = `<p>Error: ${error}</p>`;
          existingMessage.isPreformattedHTML = true;
          state.isSubmitting = false;
          state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
        } else if (isComplete) {
          // Mark as complete
          console.log(`[updateStreamingChat] Marking message as complete`);
          existingMessage.isLoader = "no";
          existingMessage.sources = sources || existingMessage.sources;
          existingMessage.relatedQuestions =
            relatedQuestions || existingMessage.relatedQuestions;
          state.isSubmitting = false;
          state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
        } else {
          // Still streaming - keep it as streaming
          existingMessage.isLoader = "streaming";
          state.streamingInProgress = true; // CRITICAL FIX: Maintain streaming state
        }
      } else {
        console.error(
          `[updateStreamingChat] Could not find streaming message with ID: ${streamingId}`
        );
        console.log(
          "Available messages:",
          state.chats.map((c) => ({
            id: c.id,
            streamingId: c.streamingId,
            isLoader: c.isLoader,
            user: c.user?.substring(0, 20) || "no user",
          }))
        );

        // CRITICAL FIX: Create a new streaming message if none found
        console.log(`[updateStreamingChat] Creating new streaming message`);
        state.chats.push({
          id: streamingId,
          streamingId: streamingId,
          user: "", // Will be empty for agent responses
          gemini: content,
          isLoader: isComplete ? "no" : "streaming",
          isSearch: true,
          searchType: "agent",
          queryKeywords: [],
          sources: sources || [],
          relatedQuestions: relatedQuestions || [],
          isPreformattedHTML: false,
          error: error || null,
          timestamp: new Date().toISOString(),
          newChat: false,
        });

        if (isComplete) {
          state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
        } else {
          state.streamingInProgress = true; // CRITICAL FIX: Set streaming state
        }
      }
    },

    hasActiveStreaming(state) {
      return (
        state.streamingInProgress ||
        state.chats.some(
          (chat) => chat.isLoader === "streaming" || chat.isLoader === "yes"
        )
      );
    },

    // CRITICAL FIX: Enhanced newChatHandler to properly reset streaming state
    newChatHandler(state) {
      console.log(`[newChatHandler] Starting new chat session`);
      state.previousChat = [];
      state.newChat = true;
      state.chats = [];
      state.chatHistoryId = null;
      state.lastQuery = "";
      state.isSubmitting = false;
      state.isLoader = false;
      state.suggestPrompt = "";
      state.streamingInProgress = false; // CRITICAL FIX: Reset streaming state
    },

    // CRITICAL FIX: Enhanced getChatHandler for loading conversation history
    getChatHandler(state, action) {
      const chats = action.payload.chats || [];
      console.log(
        `[getChatHandler] Loading ${chats.length} chat messages from history`
      );

      // CRITICAL FIX: Process and enhance loaded messages
      state.chats = chats.map((chat, index) => ({
        ...chat,
        // Ensure each message has a unique ID
        id: chat.id || chat._id || `loaded_${index}_${Date.now()}`,
        // Ensure all required fields are present
        user: chat.user || "",
        gemini: chat.gemini || "",
        isLoader: chat.isLoader || "no",
        isSearch: typeof chat.isSearch === "boolean" ? chat.isSearch : false,
        searchType: chat.searchType || null,
        queryKeywords: Array.isArray(chat.queryKeywords)
          ? chat.queryKeywords
          : [],
        sources: Array.isArray(chat.sources) ? chat.sources : [],
        relatedQuestions: Array.isArray(chat.relatedQuestions)
          ? chat.relatedQuestions
          : [],
        isPreformattedHTML:
          typeof chat.isPreformattedHTML === "boolean"
            ? chat.isPreformattedHTML
            : false,
        error: chat.error || null,
        timestamp: chat.timestamp || new Date().toISOString(),
        newChat: false, // All loaded messages are part of existing conversation
      }));

      state.newChat = false;
      state.isSubmitting = false;
      state.isLoader = false;
      state.streamingInProgress = false; // CRITICAL FIX: Reset streaming state
    },

    replaceChat(state, action) {
      state.chats = action.payload.chats || [];
      state.streamingInProgress = false; // CRITICAL FIX: Reset streaming state
    },

    suggestPromptHandler(state, action) {
      state.suggestPrompt =
        action.payload.suggestPrompt || action.payload.prompt || "";
    },

    geminiBackendOptionHandler(state, action) {
      state.geminiBackendOption = action.payload.geminiBackendOption;
    },

    // CRITICAL FIX: Enhanced chatHistoryIdHandler with better logging
    chatHistoryIdHandler(state, action) {
      const newHistoryId = action.payload.chatHistoryId;
      if (newHistoryId !== state.chatHistoryId) {
        console.log(
          `[chatHistoryIdHandler] Changing chat history ID: ${state.chatHistoryId} -> ${newHistoryId}`
        );
        state.chatHistoryId = newHistoryId;
      }
    },

    // CRITICAL FIX: Enhanced recentChatHandler with validation
    recentChatHandler(state, action) {
      const recentChats = action.payload.recentChat;
      if (Array.isArray(recentChats)) {
        console.log(
          `[recentChatHandler] Loading ${recentChats.length} recent chats`
        );
        state.recentChat = recentChats;
      } else {
        console.warn(`[recentChatHandler] Invalid recent chat data received`);
        state.recentChat = [];
      }
    },

    // CRITICAL FIX: Enhanced previousChatHandler for conversation context
    previousChatHandler(state, action) {
      if (Array.isArray(action.payload.previousChat)) {
        console.log(
          `[previousChatHandler] Setting previous chat context: ${action.payload.previousChat.length} messages`
        );
        state.previousChat = action.payload.previousChat;
      } else {
        console.warn(
          `[previousChatHandler] Invalid previous chat data received`
        );
        state.previousChat = [];
      }
    },

    replacePreviousChat(state, action) {
      if (Array.isArray(action.payload.previousChat)) {
        state.previousChat = action.payload.previousChat;
      }
    },

    // CRITICAL FIX: Enhanced popChat with better logic
    popChat(state) {
      if (state.chats.length > 0) {
        const lastMessage = state.chats[state.chats.length - 1];
        console.log(
          `[popChat] Removing last message: ${lastMessage.id}, isLoader: ${lastMessage.isLoader}`
        );

        state.chats.pop();

        // Update submission state if we removed a loading message
        if (
          lastMessage.isLoader === "yes" ||
          lastMessage.isLoader === "streaming" ||
          lastMessage.isLoader === "partial"
        ) {
          state.isSubmitting = false;
          // Only clear streaming state if no other streaming messages exist
          const hasOtherStreamingMessages = state.chats.some(
            (chat) => chat.isLoader === "streaming" || chat.isLoader === "yes"
          );
          if (!hasOtherStreamingMessages) {
            state.streamingInProgress = false;
          }
        }
      }
    },

    scrollHandler(state, action) {
      state.showScrollBottom = action.payload.showScrollBottom;
    },

    // CRITICAL FIX: Enhanced removeChatHistory with better cleanup
    removeChatHistory(state, action) {
      const chatIdToRemove = action.payload.chatId;
      console.log(`[removeChatHistory] Removing chat: ${chatIdToRemove}`);

      // Remove from recent chat list
      state.recentChat = state.recentChat.filter(
        (c) => c._id !== chatIdToRemove && c.id !== chatIdToRemove
      );

      // If the removed chat is the current one, reset to new chat
      if (state.chatHistoryId === chatIdToRemove) {
        state.chats = [];
        state.chatHistoryId = null;
        state.previousChat = [];
        state.lastQuery = "";
        state.newChat = true;
        state.isSubmitting = false;
        state.isLoader = false;
        state.streamingInProgress = false; // CRITICAL FIX: Reset streaming state
      }
    },

    updateChatContent(state, action) {
      const { searchType, content, replaceContent, isComplete } =
        action.payload;

      const loadingChatIndex = state.chats.findIndex(
        (chat) =>
          chat.isLoader === "yes" &&
          (chat.searchType === searchType || searchType === "all")
      );

      if (loadingChatIndex !== -1) {
        if (replaceContent) {
          state.chats[loadingChatIndex].gemini = content;
        } else {
          state.chats[loadingChatIndex].gemini += content;
        }
        if (isComplete) {
          state.chats[loadingChatIndex].isLoader = "no";
          state.isSubmitting = false;
          state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
        }
      }
    },

    setSubmitting(state, action) {
      console.log(
        `[setSubmitting] Setting submission state: ${action.payload}`
      );
      state.isSubmitting = action.payload;
      if (!action.payload) {
        // If not submitting, check if we should clear streaming state
        const hasStreamingMessages = state.chats.some(
          (chat) => chat.isLoader === "streaming" || chat.isLoader === "yes"
        );
        if (!hasStreamingMessages) {
          state.streamingInProgress = false;
        }
      }
    },

    clearLastQuery(state) {
      state.lastQuery = "";
    },

    // CRITICAL FIX: Enhanced clearDuplicateLoadingMessages
    clearDuplicateLoadingMessages(state) {
      const loadingMessages = state.chats.filter(
        (chat) => chat.isLoader === "yes" || chat.isLoader === "streaming"
      );

      if (loadingMessages.length > 1) {
        console.log(
          `[clearDuplicateLoadingMessages] Found ${loadingMessages.length} loading messages, keeping most recent`
        );
        const mostRecent = loadingMessages[loadingMessages.length - 1];
        state.chats = state.chats.filter(
          (chat) =>
            (chat.isLoader !== "yes" && chat.isLoader !== "streaming") ||
            chat.id === mostRecent.id
        );
      }
    },

    clearSuggestPrompt(state) {
      state.suggestPrompt = "";
    },

    // CRITICAL FIX: Enhanced appendChatMessage for conversation continuation
    appendChatMessage(state, action) {
      const useInput = action.payload.useInput;

      console.log(
        `[appendChatMessage] Appending message to existing conversation: ${state.chatHistoryId}`
      );

      // For conversation continuation, we want to add the message to existing chat
      const newMessageId =
        useInput.id ||
        useInput.streamingId ||
        `append_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Handle loading messages - prevent duplicates
      if (useInput.isLoader === "yes") {
        const existingLoadingMessage = state.chats.find(
          (chat) =>
            chat.isLoader === "yes" &&
            chat.user === useInput.user &&
            chat.searchType === useInput.searchType &&
            // Add time check to prevent very recent duplicates
            new Date().getTime() - new Date(chat.timestamp).getTime() < 1000
        );

        if (existingLoadingMessage) {
          console.log(
            `[appendChatMessage] Preventing duplicate loading message`
          );
          return;
        }

        if (useInput.user) {
          state.lastQuery = useInput.user;
        }
        state.isSubmitting = true;
        state.streamingInProgress = true; // CRITICAL FIX: Set streaming state
      } else if (useInput.isLoader === "no") {
        // For completed messages, check if we're replacing a loading message
        const loadingMessageIndex = state.chats.findIndex(
          (chat) =>
            (chat.isLoader === "yes" ||
              chat.isLoader === "streaming" ||
              chat.isLoader === "partial") &&
            ((chat.user === useInput.user && useInput.user) ||
              (chat.streamingId === useInput.streamingId &&
                useInput.streamingId))
        );

        if (loadingMessageIndex !== -1) {
          // Replace the loading message
          console.log(
            `[appendChatMessage] Replacing loading message at index: ${loadingMessageIndex}`
          );
          state.chats[loadingMessageIndex] = {
            ...state.chats[loadingMessageIndex],
            id: newMessageId,
            user: useInput.user || state.chats[loadingMessageIndex].user,
            gemini: useInput.gemini,
            isLoader: "no",
            sources: useInput.sources || [],
            relatedQuestions: useInput.relatedQuestions || [],
            queryKeywords:
              useInput.queryKeywords ||
              state.chats[loadingMessageIndex].queryKeywords ||
              [],
            isPreformattedHTML: useInput.isPreformattedHTML || false,
            error: useInput.error || null,
            timestamp: new Date().toISOString(),
          };
          state.isSubmitting = false;
          state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
          return;
        }
        state.isSubmitting = false;
        state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
      }

      // Add new message to the existing conversation
      console.log(`[appendChatMessage] Adding new message: ${newMessageId}`);
      state.chats.push({
        id: newMessageId,
        user: useInput.user || "",
        gemini: useInput.gemini || "",
        isLoader: useInput.isLoader || "no",
        isSearch: useInput.isSearch || false,
        searchType: useInput.searchType || null,
        usedCache: useInput.usedCache || false,
        queryKeywords: useInput.queryKeywords || [],
        sources: useInput.sources || [],
        relatedQuestions: useInput.relatedQuestions || [],
        isPreformattedHTML: useInput.isPreformattedHTML || false,
        error: useInput.error || null,
        streamingId: useInput.streamingId || null,
        newChat: false, // This is appended to existing conversation
        timestamp: useInput.timestamp || new Date().toISOString(),
      });
    },

    // CRITICAL FIX: Enhanced updateStreamingResponse for better streaming support
    updateStreamingResponse(state, action) {
      const { messageId, content, isComplete, sources, relatedQuestions } =
        action.payload;

      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        console.log(
          `[updateStreamingResponse] Updating message: ${messageId}, complete: ${isComplete}`
        );

        // Only update if content changed to prevent unnecessary re-renders
        if (state.chats[messageIndex].gemini !== content) {
          state.chats[messageIndex].gemini = content;
          state.chats[messageIndex].timestamp = new Date().toISOString();
        }

        if (isComplete) {
          state.chats[messageIndex].isLoader = "no";
          state.chats[messageIndex].sources =
            sources || state.chats[messageIndex].sources;
          state.chats[messageIndex].relatedQuestions =
            relatedQuestions || state.chats[messageIndex].relatedQuestions;
          state.isSubmitting = false;
          state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
        } else {
          state.chats[messageIndex].isLoader = "streaming";
          state.streamingInProgress = true; // CRITICAL FIX: Set streaming state
        }
      } else {
        console.warn(
          `[updateStreamingResponse] Message not found: ${messageId}`
        );
      }
    },

    // CRITICAL FIX: Enhanced clearError reducer
    clearError(state) {
      console.log(`[clearError] Clearing error messages`);
      // Remove any error messages from the chat
      const errorCount = state.chats.filter((chat) => chat.error).length;
      state.chats = state.chats.filter((chat) => !chat.error);
      if (errorCount > 0) {
        console.log(`[clearError] Removed ${errorCount} error messages`);
      }
    },

    // CRITICAL FIX: Enhanced retryLastMessage for better retry functionality
    retryLastMessage(state) {
      console.log(`[retryLastMessage] Retrying last message`);
      // Find the last user message and remove any subsequent error messages
      let lastUserMessageIndex = -1;

      for (let i = state.chats.length - 1; i >= 0; i--) {
        if (state.chats[i].user && state.chats[i].user.trim() !== "") {
          lastUserMessageIndex = i;
          break;
        }
      }

      if (lastUserMessageIndex !== -1) {
        // Remove all messages after the last user message (errors, failed responses)
        const removedCount = state.chats.length - lastUserMessageIndex - 1;
        state.chats = state.chats.slice(0, lastUserMessageIndex + 1);
        state.isSubmitting = false;
        state.isLoader = false;
        state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
        console.log(
          `[retryLastMessage] Removed ${removedCount} messages after last user message`
        );
      }
    },

    // CRITICAL FIX: Add markMessageAsError for error handling
    markMessageAsError(state, action) {
      const { messageId, error } = action.payload;
      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        console.log(
          `[markMessageAsError] Marking message as error: ${messageId}`
        );
        state.chats[messageIndex].error = error;
        state.chats[messageIndex].isLoader = "no";
        state.chats[messageIndex].gemini = `<p>Error: ${error}</p>`;
        state.chats[messageIndex].isPreformattedHTML = true;
        state.isSubmitting = false;
        state.streamingInProgress = false; // CRITICAL FIX: Clear streaming state
      }
    },

    // CRITICAL FIX: Add updateMessageContent for content updates
    updateMessageContent(state, action) {
      const { messageId, content, sources, relatedQuestions } = action.payload;
      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        console.log(
          `[updateMessageContent] Updating content for message: ${messageId}`
        );

        // Only update if content changed to prevent unnecessary re-renders
        if (state.chats[messageIndex].gemini !== content) {
          state.chats[messageIndex].gemini = content;
          state.chats[messageIndex].timestamp = new Date().toISOString();
        }

        if (sources) state.chats[messageIndex].sources = sources;
        if (relatedQuestions)
          state.chats[messageIndex].relatedQuestions = relatedQuestions;
      }
    },

    // CRITICAL FIX: Add action to force clear streaming state
    clearStreamingState(state) {
      console.log(`[clearStreamingState] Forcing clear of streaming state`);
      state.streamingInProgress = false;
      state.isSubmitting = false;

      // Also clear any orphaned streaming messages
      state.chats.forEach((chat) => {
        if (chat.isLoader === "streaming" || chat.isLoader === "partial") {
          chat.isLoader = "no";
        }
      });
    },
  },
});

export const chatAction = chatSlice.actions;

export default chatSlice.reducer;
