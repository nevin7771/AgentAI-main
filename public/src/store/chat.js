// public/src/store/chat.js - FIXED SERIALIZABLE STATE
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
  streamingInProgress: false,
  lastStreamingUpdate: 0,
  streamingDebounceMap: {},
  pendingSaves: [], // FIXED: Use array instead of Set for serializable state
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

      const newMessageId =
        useInput.id ||
        useInput.streamingId ||
        `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // OPTIMIZED LOGGING - Only log important events
      if (
        useInput.isLoader === "streaming" ||
        useInput.isLoader === "partial"
      ) {
        const existingStreamingMessage = state.chats.find(
          (chat) => chat.streamingId === useInput.streamingId
        );

        if (existingStreamingMessage) {
          // SMOOTH UPDATE: Only update content without timestamp to prevent re-renders
          existingStreamingMessage.gemini = useInput.gemini;
          existingStreamingMessage.isLoader = useInput.isLoader;
          return;
        }
      }

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
        newChat:
          useInput.newChat !== undefined
            ? useInput.newChat
            : !state.chatHistoryId,
        timestamp: useInput.timestamp || new Date().toISOString(),
      });

      if (useInput.isLoader === "yes" || useInput.isLoader === "streaming") {
        state.isSubmitting = true;
        state.streamingInProgress = true;
      }
      state.newChat = false;
    },

    // ENHANCED: Ultra-optimized streaming with save tracking
    updateStreamingChat(state, action) {
      const {
        streamingId,
        content,
        isComplete,
        sources,
        relatedQuestions,
        error,
      } = action.payload;

      // REDUCED LOGGING - Only log completion
      if (isComplete) {
        console.log(`[updateStreamingChat] Completing ${streamingId}`);
      }

      // Find the message to update
      let messageIndex = state.chats.findIndex(
        (chat) => chat.streamingId === streamingId || chat.id === streamingId
      );

      // Fallback to find most recent streaming message
      if (messageIndex === -1) {
        messageIndex = state.chats.findIndex(
          (chat) => chat.isLoader === "streaming" || chat.isLoader === "yes"
        );
      }

      if (messageIndex !== -1) {
        const existingMessage = state.chats[messageIndex];

        // SMOOTH UPDATE: Only update content if it actually changed
        if (existingMessage.gemini !== content) {
          existingMessage.gemini = content || "";
          // Only update timestamp on completion to prevent flicker
          if (isComplete) {
            existingMessage.timestamp = new Date().toISOString();
          }
        }

        // Ensure streamingId is preserved
        if (!existingMessage.streamingId && streamingId) {
          existingMessage.streamingId = streamingId;
        }

        if (error) {
          existingMessage.error = error;
          existingMessage.isLoader = "no";
          existingMessage.gemini = `<p>Error: ${error}</p>`;
          existingMessage.isPreformattedHTML = true;
          state.isSubmitting = false;
          state.streamingInProgress = false;
          existingMessage.timestamp = new Date().toISOString();
        } else if (isComplete) {
          existingMessage.isLoader = "no";
          existingMessage.sources = sources || existingMessage.sources;
          existingMessage.relatedQuestions =
            relatedQuestions || existingMessage.relatedQuestions;
          state.isSubmitting = false;
          state.streamingInProgress = false;
          existingMessage.timestamp = new Date().toISOString();

          // ENHANCED: Mark as ready for save verification
          existingMessage.readyForSaveVerification = true;
        } else {
          existingMessage.isLoader = "streaming";
          state.streamingInProgress = true;
        }
      } else {
        // Create new message if not found
        state.chats.push({
          id: streamingId,
          streamingId: streamingId,
          user: "",
          gemini: content || "",
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
          readyForSaveVerification: isComplete,
        });

        state.streamingInProgress = !isComplete;
      }
    },

    // ENHANCED: Check for active streaming
    hasActiveStreaming(state) {
      return (
        state.streamingInProgress ||
        state.chats.some(
          (chat) => chat.isLoader === "streaming" || chat.isLoader === "yes"
        )
      );
    },

    newChatHandler(state) {
      state.previousChat = [];
      state.newChat = true;
      state.chats = [];
      state.chatHistoryId = null;
      state.lastQuery = "";
      state.isSubmitting = false;
      state.isLoader = false;
      state.suggestPrompt = "";
      state.streamingInProgress = false;
      state.lastStreamingUpdate = 0;
      state.streamingDebounceMap = {};
      state.pendingSaves = []; // FIXED: Reset as empty array
    },

    getChatHandler(state, action) {
      const chats = action.payload.chats || [];

      state.chats = chats.map((chat, index) => ({
        ...chat,
        id: chat.id || chat._id || `loaded_${index}_${Date.now()}`,
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
        newChat: false,
      }));

      state.newChat = false;
      state.isSubmitting = false;
      state.isLoader = false;
      state.streamingInProgress = false;
      state.lastStreamingUpdate = 0;
      state.streamingDebounceMap = {};
      state.pendingSaves = []; // FIXED: Reset as empty array
    },

    replaceChat(state, action) {
      state.chats = action.payload.chats || [];
      state.streamingInProgress = false;
      state.lastStreamingUpdate = 0;
      state.streamingDebounceMap = {};
      state.pendingSaves = []; // FIXED: Reset as empty array
    },

    suggestPromptHandler(state, action) {
      state.suggestPrompt =
        action.payload.suggestPrompt || action.payload.prompt || "";
    },

    geminiBackendOptionHandler(state, action) {
      state.geminiBackendOption = action.payload.geminiBackendOption;
    },

    // ENHANCED: Chat history ID handler with logging
    chatHistoryIdHandler(state, action) {
      const newHistoryId = action.payload.chatHistoryId;
      if (newHistoryId !== state.chatHistoryId) {
        console.log(
          `[chatHistoryIdHandler] Updating chat history ID: ${state.chatHistoryId} -> ${newHistoryId}`
        );
        state.chatHistoryId = newHistoryId;
      }
    },

    recentChatHandler(state, action) {
      const recentChats = action.payload.recentChat;
      if (Array.isArray(recentChats)) {
        state.recentChat = recentChats;
      } else {
        state.recentChat = [];
      }
    },

    // ENHANCED: Previous chat handler with logging
    previousChatHandler(state, action) {
      if (Array.isArray(action.payload.previousChat)) {
        console.log(
          `[previousChatHandler] Setting conversation context: ${action.payload.previousChat.length} messages`
        );
        state.previousChat = action.payload.previousChat;
      } else {
        state.previousChat = [];
      }
    },

    replacePreviousChat(state, action) {
      if (Array.isArray(action.payload.previousChat)) {
        state.previousChat = action.payload.previousChat;
      }
    },

    popChat(state) {
      if (state.chats.length > 0) {
        const lastMessage = state.chats[state.chats.length - 1];

        // Clean up debounce tracking for removed message
        if (lastMessage.streamingId) {
          const debounceKey = `streaming_${lastMessage.streamingId}`;
          delete state.streamingDebounceMap[debounceKey];
        }

        state.chats.pop();

        if (
          lastMessage.isLoader === "yes" ||
          lastMessage.isLoader === "streaming" ||
          lastMessage.isLoader === "partial"
        ) {
          state.isSubmitting = false;
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

    removeChatHistory(state, action) {
      const chatIdToRemove = action.payload.chatId;

      state.recentChat = state.recentChat.filter(
        (c) => c._id !== chatIdToRemove && c.id !== chatIdToRemove
      );

      if (state.chatHistoryId === chatIdToRemove) {
        state.chats = [];
        state.chatHistoryId = null;
        state.previousChat = [];
        state.lastQuery = "";
        state.newChat = true;
        state.isSubmitting = false;
        state.isLoader = false;
        state.streamingInProgress = false;
        state.lastStreamingUpdate = 0;
        state.streamingDebounceMap = {};
        state.pendingSaves = []; // FIXED: Reset as empty array
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
          state.chats[loadingChatIndex].timestamp = new Date().toISOString();
          state.isSubmitting = false;
          state.streamingInProgress = false;
        }
      }
    },

    setSubmitting(state, action) {
      state.isSubmitting = action.payload;
      if (!action.payload) {
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

    clearDuplicateLoadingMessages(state) {
      const loadingMessages = state.chats.filter(
        (chat) => chat.isLoader === "yes" || chat.isLoader === "streaming"
      );

      if (loadingMessages.length > 1) {
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

    appendChatMessage(state, action) {
      const useInput = action.payload.useInput;

      const newMessageId =
        useInput.id ||
        useInput.streamingId ||
        `append_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (useInput.isLoader === "yes") {
        const existingLoadingMessage = state.chats.find(
          (chat) =>
            chat.isLoader === "yes" &&
            chat.user === useInput.user &&
            chat.searchType === useInput.searchType &&
            new Date().getTime() - new Date(chat.timestamp).getTime() < 1000
        );

        if (existingLoadingMessage) {
          return; // Prevent duplicate loading message
        }

        if (useInput.user) {
          state.lastQuery = useInput.user;
        }
        state.isSubmitting = true;
        state.streamingInProgress = true;
      } else if (useInput.isLoader === "no") {
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
          // Clean up debounce tracking for replaced message
          const oldMessage = state.chats[loadingMessageIndex];
          if (oldMessage.streamingId) {
            const debounceKey = `streaming_${oldMessage.streamingId}`;
            delete state.streamingDebounceMap[debounceKey];
          }

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
          state.streamingInProgress = false;
          return;
        }
        state.isSubmitting = false;
        state.streamingInProgress = false;
      }

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
        newChat: false,
        timestamp: useInput.timestamp || new Date().toISOString(),
      });
    },

    updateStreamingResponse(state, action) {
      const { messageId, content, isComplete, sources, relatedQuestions } =
        action.payload;

      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        // SMOOTH UPDATE: Only update if content actually changed
        if (state.chats[messageIndex].gemini !== content) {
          state.chats[messageIndex].gemini = content;
          // Only update timestamp on completion
          if (isComplete) {
            state.chats[messageIndex].timestamp = new Date().toISOString();
          }
        }

        if (isComplete) {
          state.chats[messageIndex].isLoader = "no";
          state.chats[messageIndex].sources =
            sources || state.chats[messageIndex].sources;
          state.chats[messageIndex].relatedQuestions =
            relatedQuestions || state.chats[messageIndex].relatedQuestions;
          state.isSubmitting = false;
          state.streamingInProgress = false;
        } else {
          state.chats[messageIndex].isLoader = "streaming";
          state.streamingInProgress = true;
        }
      }
    },

    clearError(state) {
      state.chats = state.chats.filter((chat) => !chat.error);
    },

    retryLastMessage(state) {
      let lastUserMessageIndex = -1;

      for (let i = state.chats.length - 1; i >= 0; i--) {
        if (state.chats[i].user && state.chats[i].user.trim() !== "") {
          lastUserMessageIndex = i;
          break;
        }
      }

      if (lastUserMessageIndex !== -1) {
        state.chats = state.chats.slice(0, lastUserMessageIndex + 1);
        state.isSubmitting = false;
        state.isLoader = false;
        state.streamingInProgress = false;
      }
    },

    markMessageAsError(state, action) {
      const { messageId, error } = action.payload;
      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        // Clean up debounce tracking for error message
        const message = state.chats[messageIndex];
        if (message.streamingId) {
          const debounceKey = `streaming_${message.streamingId}`;
          delete state.streamingDebounceMap[debounceKey];
        }

        state.chats[messageIndex].error = error;
        state.chats[messageIndex].isLoader = "no";
        state.chats[messageIndex].gemini = `<p>Error: ${error}</p>`;
        state.chats[messageIndex].isPreformattedHTML = true;
        state.chats[messageIndex].timestamp = new Date().toISOString();
        state.isSubmitting = false;
        state.streamingInProgress = false;
      }
    },

    updateMessageContent(state, action) {
      const { messageId, content, sources, relatedQuestions } = action.payload;
      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        // SMOOTH UPDATE: Only update if content actually changed
        if (state.chats[messageIndex].gemini !== content) {
          state.chats[messageIndex].gemini = content;
          state.chats[messageIndex].timestamp = new Date().toISOString();
        }

        if (sources) state.chats[messageIndex].sources = sources;
        if (relatedQuestions)
          state.chats[messageIndex].relatedQuestions = relatedQuestions;
      }
    },

    clearStreamingState(state) {
      state.streamingInProgress = false;
      state.isSubmitting = false;
      state.lastStreamingUpdate = 0;
      state.streamingDebounceMap = {};
      state.pendingSaves = []; // FIXED: Reset as empty array

      state.chats.forEach((chat) => {
        if (chat.isLoader === "streaming" || chat.isLoader === "partial") {
          chat.isLoader = "no";
          chat.timestamp = new Date().toISOString();
        }
      });
    },

    // ENHANCED: Force update with save tracking
    forceUpdateStreamingChat(state, action) {
      const {
        streamingId,
        content,
        isComplete,
        sources,
        relatedQuestions,
        error,
      } = action.payload;

      const messageIndex = state.chats.findIndex(
        (chat) => chat.streamingId === streamingId || chat.id === streamingId
      );

      if (messageIndex !== -1) {
        const existingMessage = state.chats[messageIndex];

        // SMOOTH UPDATE: Only update if content actually changed
        if (existingMessage.gemini !== content) {
          existingMessage.gemini = content;
          state.lastStreamingUpdate = Date.now();
          // Only update timestamp on completion or error
          if (isComplete || error) {
            existingMessage.timestamp = new Date().toISOString();
          }
        }

        if (error) {
          existingMessage.error = error;
          existingMessage.isLoader = "no";
          existingMessage.gemini = `<p>Error: ${error}</p>`;
          existingMessage.isPreformattedHTML = true;
          existingMessage.timestamp = new Date().toISOString();
          state.isSubmitting = false;
          state.streamingInProgress = false;
        } else if (isComplete) {
          existingMessage.isLoader = "no";
          existingMessage.sources = sources || existingMessage.sources;
          existingMessage.relatedQuestions =
            relatedQuestions || existingMessage.relatedQuestions;
          existingMessage.timestamp = new Date().toISOString();
          existingMessage.readyForSaveVerification = true;
          state.isSubmitting = false;
          state.streamingInProgress = false;
        } else {
          existingMessage.isLoader = "streaming";
          state.streamingInProgress = true;
        }
      }
    },

    // FIXED: Track save operations using arrays instead of Set
    addPendingSave(state, action) {
      const { chatHistoryId } = action.payload;
      if (!state.pendingSaves.includes(chatHistoryId)) {
        state.pendingSaves.push(chatHistoryId);
      }
    },

    removePendingSave(state, action) {
      const { chatHistoryId } = action.payload;
      state.pendingSaves = state.pendingSaves.filter(
        (id) => id !== chatHistoryId
      );
    },

    // NEW: Mark messages as saved
    markMessageAsSaved(state, action) {
      const { messageId, chatHistoryId } = action.payload;
      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        state.chats[messageIndex].saved = true;
        state.chats[messageIndex].savedChatHistoryId = chatHistoryId;
      }
    },
  },
});

export const chatAction = chatSlice.actions;

export default chatSlice.reducer;
