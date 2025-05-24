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
  showScrollBottom: false, // Add this for scroll button management
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

      // Enhanced duplicate prevention logic for loading messages
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
      } else {
        // For non-loading messages, check if we're replacing a loading message
        const loadingMessageIndex = state.chats.findIndex(
          (chat) =>
            chat.isLoader === "yes" &&
            chat.user === useInput.user &&
            chat.searchType === useInput.searchType
        );

        if (loadingMessageIndex !== -1) {
          // Replace the loading message instead of adding a new one
          state.chats[loadingMessageIndex] = {
            id: state.chats[loadingMessageIndex].id,
            user: useInput.user,
            gemini: useInput.gemini,
            isLoader: "no",
            newChat: true,
            isSearch: useInput.isSearch || false,
            searchType: useInput.searchType || null,
            queryKeywords: useInput.queryKeywords || [],
            sources: useInput.sources || [],
            relatedQuestions: useInput.relatedQuestions || [],
            isPreformattedHTML: useInput.isPreformattedHTML || false,
            error: useInput.error || null,
            timestamp: useInput.timestamp || new Date().toISOString(),
            streamingId: useInput.streamingId || null,
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

    // CRITICAL FIX: Add updateStreamingChat reducer for Day One streaming
    updateStreamingChat(state, action) {
      const { streamingId, content, isComplete, sources, relatedQuestions } =
        action.payload;

      const messageIndex = state.chats.findIndex(
        (chat) => chat.streamingId === streamingId
      );

      if (messageIndex !== -1) {
        // Update the content
        state.chats[messageIndex].gemini = content;

        if (isComplete) {
          // Mark as complete
          state.chats[messageIndex].isLoader = "no";
          state.chats[messageIndex].sources =
            sources || state.chats[messageIndex].sources;
          state.chats[messageIndex].relatedQuestions =
            relatedQuestions || state.chats[messageIndex].relatedQuestions;
          state.isSubmitting = false;
        } else {
          // Still streaming - set to partial if not already streaming
          if (state.chats[messageIndex].isLoader !== "streaming") {
            state.chats[messageIndex].isLoader = "partial";
          }
        }
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
      state.chatHistoryId = action.payload.chatHistoryId;
    },

    recentChatHandler(state, action) {
      state.recentChat = action.payload.recentChat;
    },

    previousChatHandler(state, action) {
      if (Array.isArray(action.payload.previousChat)) {
        state.previousChat = action.payload.previousChat;
      }
    },

    replacePreviousChat(state, action) {
      state.previousChat = action.payload.previousChat;
    },

    popChat(state) {
      if (state.chats.length > 0) {
        const lastMessage = state.chats[state.chats.length - 1];
        if (
          lastMessage.isLoader === "yes" ||
          lastMessage.isLoader === "streaming" ||
          lastMessage.isLoader === "partial"
        ) {
          // Remove loader/streaming message
          state.chats.pop();
          // If there was a user message before the loader, optionally remove it too
          // (This depends on your UX - you might want to keep the user message)
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
      state.chats = action.payload.chats || [];
    },

    // CRITICAL FIX: Add clearSuggestPrompt reducer
    clearSuggestPrompt(state) {
      state.suggestPrompt = "";
    },
  },
});

export const chatAction = chatSlice.actions;

export default chatSlice.reducer;
