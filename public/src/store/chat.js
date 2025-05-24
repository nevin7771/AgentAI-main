// public/src/store/chat.js - CRITICAL FIX: Enhanced streaming and conversation support
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

      // Ensure a unique ID for each chat message
      const newMessageId = useInput.id || new Date().getTime().toString();

      // CRITICAL FIX: Enhanced duplicate prevention logic for loading messages
      if (useInput.isLoader === "yes") {
        const existingLoadingMessage = state.chats.find(
          (chat) =>
            chat.isLoader === "yes" &&
            chat.user === useInput.user &&
            chat.searchType === useInput.searchType
        );

        if (existingLoadingMessage) {
          console.log(
            `[chatStart] Preventing exact duplicate loading message for: "${useInput.user}"`
          );
          return;
        }

        if (useInput.user) {
          state.lastQuery = useInput.user;
        }
      } else if (
        useInput.isLoader === "streaming" ||
        useInput.isLoader === "partial"
      ) {
        // CRITICAL FIX: Handle streaming messages
        const existingStreamingMessage = state.chats.find(
          (chat) => chat.streamingId === useInput.streamingId
        );

        if (existingStreamingMessage) {
          console.log(
            `[chatStart] Updating existing streaming message: ${useInput.streamingId}`
          );
          existingStreamingMessage.gemini = useInput.gemini;
          existingStreamingMessage.isLoader = useInput.isLoader;
          return;
        }
      } else {
        // For non-loading messages, check if we're replacing a loading message
        const loadingMessageIndex = state.chats.findIndex(
          (chat) =>
            (chat.isLoader === "yes" ||
              chat.isLoader === "streaming" ||
              chat.isLoader === "partial") &&
            chat.user === useInput.user &&
            chat.searchType === useInput.searchType
        );

        if (loadingMessageIndex !== -1) {
          // Replace the loading message instead of adding a new one
          state.chats[loadingMessageIndex] = {
            ...state.chats[loadingMessageIndex],
            gemini: useInput.gemini,
            isLoader: "no",
            sources: useInput.sources || [],
            relatedQuestions: useInput.relatedQuestions || [],
            isPreformattedHTML: useInput.isPreformattedHTML || false,
            error: useInput.error || null,
            timestamp: useInput.timestamp || new Date().toISOString(),
          };
          return;
        }
      }

      // Add new chat message
      state.chats.push({
        id: newMessageId,
        user: useInput.user,
        gemini: useInput.gemini,
        isLoader: useInput.isLoader,
        isSearch: useInput.isSearch || false,
        searchType: useInput.searchType || null,
        usedCache: useInput.usedCache || false,
        queryKeywords: useInput.queryKeywords || [],
        sources: useInput.sources || [],
        relatedQuestions: useInput.relatedQuestions || [],
        isPreformattedHTML: useInput.isPreformattedHTML || false,
        error: useInput.error || null,
        streamingId: useInput.streamingId || null,
        newChat: useInput.newChat !== undefined ? useInput.newChat : true,
        timestamp: useInput.timestamp || new Date().toISOString(),
      });
    },

    // CRITICAL FIX: Enhanced updateStreamingChat reducer for Day One streaming
    updateStreamingChat(state, action) {
      const { streamingId, content, isComplete, sources, relatedQuestions } =
        action.payload;

      console.log(
        `[updateStreamingChat] Updating streaming message: ${streamingId}`
      );

      const messageIndex = state.chats.findIndex(
        (chat) => chat.streamingId === streamingId
      );

      if (messageIndex !== -1) {
        console.log(
          `[updateStreamingChat] Found message at index: ${messageIndex}`
        );

        // Update the content
        state.chats[messageIndex].gemini = content;

        if (isComplete) {
          // Mark as complete
          console.log(`[updateStreamingChat] Marking message as complete`);
          state.chats[messageIndex].isLoader = "no";
          state.chats[messageIndex].sources =
            sources || state.chats[messageIndex].sources;
          state.chats[messageIndex].relatedQuestions =
            relatedQuestions || state.chats[messageIndex].relatedQuestions;
          state.isSubmitting = false;
        } else {
          // Still streaming - keep it as streaming
          state.chats[messageIndex].isLoader = "streaming";
        }
      } else {
        console.warn(
          `[updateStreamingChat] Could not find streaming message with ID: ${streamingId}`
        );
      }
    },

    newChatHandler(state) {
      state.previousChat = [];
      state.newChat = true;
      state.chats = [];
      state.chatHistoryId = null;
      state.lastQuery = "";
    },

    replaceChat(state, action) {
      state.chats = action.payload.chats || [];
    },

    suggestPromptHandler(state, action) {
      state.suggestPrompt =
        action.payload.suggestPrompt || action.payload.prompt || "";
    },

    geminiBackendOptionHandler(state, action) {
      state.geminiBackendOption = action.payload.geminiBackendOption;
    },

    chatHistoryIdHandler(state, action) {
      console.log(
        `[chatHistoryIdHandler] Setting chat history ID: ${action.payload.chatHistoryId}`
      );
      state.chatHistoryId = action.payload.chatHistoryId;
    },

    recentChatHandler(state, action) {
      state.recentChat = action.payload.recentChat;
    },

    previousChatHandler(state, action) {
      if (Array.isArray(action.payload.previousChat)) {
        console.log(
          `[previousChatHandler] Setting previous chat context: ${action.payload.previousChat.length} messages`
        );
        state.previousChat = action.payload.previousChat;
      }
    },

    replacePreviousChat(state, action) {
      state.previousChat = action.payload.previousChat;
    },

    popChat(state) {
      if (state.chats.length > 0) {
        const lastMessage = state.chats[state.chats.length - 1];
        console.log(
          `[popChat] Removing last message, isLoader: ${lastMessage.isLoader}`
        );

        if (
          lastMessage.isLoader === "yes" ||
          lastMessage.isLoader === "streaming" ||
          lastMessage.isLoader === "partial"
        ) {
          // Remove loader/streaming message
          state.chats.pop();
        } else {
          // Regular message removal
          state.chats.pop();
        }
      }
    },

    scrollHandler(state, action) {
      state.showScrollBottom = action.payload.showScrollBottom;
    },

    removeChatHistory(state, action) {
      const chatIdToRemove = action.payload.chatId;
      state.recentChat = state.recentChat.filter(
        (c) => c._id !== chatIdToRemove
      );
      if (state.chatHistoryId === chatIdToRemove) {
        state.chats = [];
        state.chatHistoryId = null;
        state.previousChat = [];
        state.lastQuery = "";
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
        }
      }
    },

    setSubmitting(state, action) {
      state.isSubmitting = action.payload;
    },

    clearLastQuery(state) {
      state.lastQuery = "";
    },

    clearDuplicateLoadingMessages(state) {
      const loadingMessages = state.chats.filter(
        (chat) => chat.isLoader === "yes"
      );

      if (loadingMessages.length > 1) {
        const mostRecent = loadingMessages[loadingMessages.length - 1];
        state.chats = state.chats.filter(
          (chat) => chat.isLoader !== "yes" || chat.id === mostRecent.id
        );
      }
    },

    getChatHandler(state, action) {
      console.log(
        `[getChatHandler] Loading ${
          action.payload.chats?.length || 0
        } chat messages`
      );
      state.chats = action.payload.chats || [];
    },

    // CRITICAL FIX: Add clearSuggestPrompt reducer
    clearSuggestPrompt(state) {
      state.suggestPrompt = "";
    },

    // CRITICAL FIX: Add appendChatMessage for conversation continuation
    appendChatMessage(state, action) {
      const useInput = action.payload.useInput;

      console.log(
        `[appendChatMessage] Appending message to existing conversation`
      );

      // For conversation continuation, we want to add the message to existing chat
      // This is similar to chatStart but doesn't reset the conversation context

      const newMessageId = useInput.id || new Date().getTime().toString();

      // Handle loading messages
      if (useInput.isLoader === "yes") {
        const existingLoadingMessage = state.chats.find(
          (chat) =>
            chat.isLoader === "yes" &&
            chat.user === useInput.user &&
            chat.searchType === useInput.searchType
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
      } else {
        // For non-loading messages, check if we're replacing a loading message
        const loadingMessageIndex = state.chats.findIndex(
          (chat) =>
            (chat.isLoader === "yes" ||
              chat.isLoader === "streaming" ||
              chat.isLoader === "partial") &&
            chat.user === useInput.user &&
            chat.searchType === useInput.searchType
        );

        if (loadingMessageIndex !== -1) {
          // Replace the loading message
          state.chats[loadingMessageIndex] = {
            ...state.chats[loadingMessageIndex],
            gemini: useInput.gemini,
            isLoader: "no",
            sources: useInput.sources || [],
            relatedQuestions: useInput.relatedQuestions || [],
            isPreformattedHTML: useInput.isPreformattedHTML || false,
            error: useInput.error || null,
            timestamp: useInput.timestamp || new Date().toISOString(),
          };
          return;
        }
      }

      // Add new message to the existing conversation
      state.chats.push({
        id: newMessageId,
        user: useInput.user,
        gemini: useInput.gemini,
        isLoader: useInput.isLoader,
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

    // CRITICAL FIX: Add reducer to handle streaming response updates
    updateStreamingResponse(state, action) {
      const { messageId, content, isComplete } = action.payload;

      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        state.chats[messageIndex].gemini = content;

        if (isComplete) {
          state.chats[messageIndex].isLoader = "no";
        } else {
          state.chats[messageIndex].isLoader = "streaming";
        }
      }
    },

    // CRITICAL FIX: Add reducer to clear error states
    clearError(state) {
      // Remove any error messages from the chat
      state.chats = state.chats.filter((chat) => !chat.error);
    },

    // CRITICAL FIX: Add reducer to handle retry functionality
    retryLastMessage(state) {
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
        state.chats = state.chats.slice(0, lastUserMessageIndex + 1);
      }
    },
  },
});

export const chatAction = chatSlice.actions;

export default chatSlice.reducer;
