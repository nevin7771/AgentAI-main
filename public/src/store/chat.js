// public/src/store/chat.js - ULTRA-OPTIMIZED FOR ZERO BLINKING
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
  streamingDebounceMap: {}, // CRITICAL FIX: Track streaming updates per message
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

      console.log(
        `[chatStart] Processing message - ID: ${newMessageId}, streamingId: ${useInput.streamingId}, isLoader: ${useInput.isLoader}`
      );

      if (
        useInput.isLoader === "streaming" ||
        useInput.isLoader === "partial"
      ) {
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

    // CRITICAL FIX: Ultra-aggressive streaming optimization
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
        `[updateStreamingChat] ${streamingId}, complete: ${isComplete}, content length: ${
          content?.length || 0
        }`
      );

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

        // Update content
        existingMessage.gemini = content || "";
        existingMessage.timestamp = new Date().toISOString();

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
        } else if (isComplete) {
          console.log(`[updateStreamingChat] Marking message as complete`);
          existingMessage.isLoader = "no";
          existingMessage.sources = sources || existingMessage.sources;
          existingMessage.relatedQuestions =
            relatedQuestions || existingMessage.relatedQuestions;
          state.isSubmitting = false;
          state.streamingInProgress = false;
        } else {
          existingMessage.isLoader = "streaming";
          state.streamingInProgress = true;
        }
      } else {
        console.log(
          `[updateStreamingChat] Message not found, creating new one`
        );

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
        });

        state.streamingInProgress = !isComplete;
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
      state.streamingInProgress = false;
      state.lastStreamingUpdate = 0;
      state.streamingDebounceMap = {}; // CRITICAL FIX: Clear debounce map
    },

    getChatHandler(state, action) {
      const chats = action.payload.chats || [];
      console.log(
        `[getChatHandler] Loading ${chats.length} chat messages from history`
      );

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
      state.streamingDebounceMap = {}; // CRITICAL FIX: Clear debounce map
    },

    replaceChat(state, action) {
      state.chats = action.payload.chats || [];
      state.streamingInProgress = false;
      state.lastStreamingUpdate = 0;
      state.streamingDebounceMap = {}; // CRITICAL FIX: Clear debounce map
    },

    suggestPromptHandler(state, action) {
      state.suggestPrompt =
        action.payload.suggestPrompt || action.payload.prompt || "";
    },

    geminiBackendOptionHandler(state, action) {
      state.geminiBackendOption = action.payload.geminiBackendOption;
    },

    chatHistoryIdHandler(state, action) {
      const newHistoryId = action.payload.chatHistoryId;
      if (newHistoryId !== state.chatHistoryId) {
        console.log(
          `[chatHistoryIdHandler] Changing chat history ID: ${state.chatHistoryId} -> ${newHistoryId}`
        );
        state.chatHistoryId = newHistoryId;
      }
    },

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

    popChat(state) {
      if (state.chats.length > 0) {
        const lastMessage = state.chats[state.chats.length - 1];
        console.log(
          `[popChat] Removing last message: ${lastMessage.id}, isLoader: ${lastMessage.isLoader}`
        );

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
      console.log(`[removeChatHistory] Removing chat: ${chatIdToRemove}`);

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
        state.streamingDebounceMap = {}; // CRITICAL FIX: Clear debounce map
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
          state.streamingInProgress = false;
        }
      }
    },

    setSubmitting(state, action) {
      console.log(
        `[setSubmitting] Setting submission state: ${action.payload}`
      );
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

    appendChatMessage(state, action) {
      const useInput = action.payload.useInput;

      console.log(
        `[appendChatMessage] Appending message to existing conversation: ${state.chatHistoryId}`
      );

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
          console.log(
            `[appendChatMessage] Preventing duplicate loading message`
          );
          return;
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
          console.log(
            `[appendChatMessage] Replacing loading message at index: ${loadingMessageIndex}`
          );

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
        console.log(
          `[updateStreamingResponse] Updating message: ${messageId}, complete: ${isComplete}`
        );

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
          state.streamingInProgress = false;
        } else {
          state.chats[messageIndex].isLoader = "streaming";
          state.streamingInProgress = true;
        }
      } else {
        console.warn(
          `[updateStreamingResponse] Message not found: ${messageId}`
        );
      }
    },

    clearError(state) {
      console.log(`[clearError] Clearing error messages`);
      const errorCount = state.chats.filter((chat) => chat.error).length;
      state.chats = state.chats.filter((chat) => !chat.error);
      if (errorCount > 0) {
        console.log(`[clearError] Removed ${errorCount} error messages`);
      }
    },

    retryLastMessage(state) {
      console.log(`[retryLastMessage] Retrying last message`);
      let lastUserMessageIndex = -1;

      for (let i = state.chats.length - 1; i >= 0; i--) {
        if (state.chats[i].user && state.chats[i].user.trim() !== "") {
          lastUserMessageIndex = i;
          break;
        }
      }

      if (lastUserMessageIndex !== -1) {
        const removedCount = state.chats.length - lastUserMessageIndex - 1;
        state.chats = state.chats.slice(0, lastUserMessageIndex + 1);
        state.isSubmitting = false;
        state.isLoader = false;
        state.streamingInProgress = false;
        console.log(
          `[retryLastMessage] Removed ${removedCount} messages after last user message`
        );
      }
    },

    markMessageAsError(state, action) {
      const { messageId, error } = action.payload;
      const messageIndex = state.chats.findIndex(
        (chat) => chat.id === messageId || chat.streamingId === messageId
      );

      if (messageIndex !== -1) {
        console.log(
          `[markMessageAsError] Marking message as error: ${messageId}`
        );

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
        console.log(
          `[updateMessageContent] Updating content for message: ${messageId}`
        );

        if (state.chats[messageIndex].gemini !== content) {
          state.chats[messageIndex].gemini = content;
          state.chats[messageIndex].timestamp = new Date().toISOString();
        }

        if (sources) state.chats[messageIndex].sources = sources;
        if (relatedQuestions)
          state.chats[messageIndex].relatedQuestions = relatedQuestions;
      }
    },

    // CRITICAL FIX: Enhanced clearStreamingState
    clearStreamingState(state) {
      console.log(`[clearStreamingState] Forcing clear of streaming state`);
      state.streamingInProgress = false;
      state.isSubmitting = false;
      state.lastStreamingUpdate = 0;
      state.streamingDebounceMap = {}; // CRITICAL FIX: Clear all debounce tracking

      state.chats.forEach((chat) => {
        if (chat.isLoader === "streaming" || chat.isLoader === "partial") {
          chat.isLoader = "no";
        }
      });
    },

    // CRITICAL FIX: Force update streaming content (bypass throttling)
    forceUpdateStreamingChat(state, action) {
      const {
        streamingId,
        content,
        isComplete,
        sources,
        relatedQuestions,
        error,
      } = action.payload;

      console.log(`[forceUpdateStreamingChat] Force updating ${streamingId}`);

      const messageIndex = state.chats.findIndex(
        (chat) => chat.streamingId === streamingId || chat.id === streamingId
      );

      if (messageIndex !== -1) {
        const existingMessage = state.chats[messageIndex];

        existingMessage.gemini = content;
        existingMessage.timestamp = new Date().toISOString();
        state.lastStreamingUpdate = Date.now();

        if (error) {
          existingMessage.error = error;
          existingMessage.isLoader = "no";
          existingMessage.gemini = `<p>Error: ${error}</p>`;
          existingMessage.isPreformattedHTML = true;
          state.isSubmitting = false;
          state.streamingInProgress = false;
        } else if (isComplete) {
          existingMessage.isLoader = "no";
          existingMessage.sources = sources || existingMessage.sources;
          existingMessage.relatedQuestions =
            relatedQuestions || existingMessage.relatedQuestions;
          state.isSubmitting = false;
          state.streamingInProgress = false;
        } else {
          existingMessage.isLoader = "streaming";
          state.streamingInProgress = true;
        }
      }
    },
  },
});

export const chatAction = chatSlice.actions;

export default chatSlice.reducer;
