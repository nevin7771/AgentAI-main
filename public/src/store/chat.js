import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  chats: [],
  newChat: false,
  isLoader: false,
  isSubmitting: false,
  lastQuery: "",
  recentChat: [],
  previousChat: [],
  chatHistoryId: "",
  suggestPrompt: "",
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    loaderHandler(state) {
      state.isLoader = !state.isLoader;
    },
    newChatHandler(state) {
      state.chats.length > 0 ? (state.newChat = true) : (state.newChat = false);
    },
    replaceChat(state, action) {
      state.chats = action.payload.chats;
    },
    getChatHandler(state, action) {
      state.chats = action.payload.chats || []; // Ensure chats is always an array
    },
    recentChatHandler(state, action) {
      state.recentChat = action.payload.recentChat;
    },
    chatStart(state, action) {
      if (
        action.payload.useInput.isLoader === "yes" &&
        state.lastQuery === action.payload.useInput.user
      ) {
        return;
      }
      if (action.payload.useInput.user) {
        state.lastQuery = action.payload.useInput.user;
      }
      state.chats.push({
        user: action.payload.useInput.user,
        isLoader: action.payload.useInput.isLoader,
        gemini: action.payload.useInput.gemini,
        id: Math.random(),
        newChat: true,
        isSearch: action.payload.useInput.isSearch || false,
        searchType: action.payload.useInput.searchType || null,
        queryKeywords: action.payload.useInput.queryKeywords || [],
        sources: action.payload.useInput.sources || [],
        relatedQuestions: action.payload.useInput.relatedQuestions || [],
        isPreformattedHTML: action.payload.useInput.isPreformattedHTML || false,
        error: action.payload.useInput.error || null,
        timestamp:
          action.payload.useInput.timestamp || new Date().toISOString(),
      });
    },
    popChat(state) {
      state.chats.pop();
    },
    previousChatHandler(state, action) {
      if (Array.isArray(action.payload.previousChat)) {
        state.previousChat = action.payload.previousChat;
      }
    },
    replacePreviousChat(state, action) {
      state.previousChat = action.payload.previousChat;
    },
    chatHistoryIdHandler(state, action) {
      state.chatHistoryId = action.payload.chatHistoryId;
    },
    suggestPromptHandler(state, action) {
      state.suggestPrompt = action.payload.prompt;
    },
    setSubmitting(state, action) {
      state.isSubmitting = action.payload;
    },
    clearLastQuery(state) {
      state.lastQuery = "";
    },
    // Added to handle chat deletion from the UI (sidebar)
    removeChatHistory(state, action) {
      const chatIdToRemove = action.payload.chatId;
      state.recentChat = state.recentChat.filter(
        (chat) => chat._id !== chatIdToRemove
      );
      // If the currently active chat is the one being deleted, clear it
      if (state.chatHistoryId === chatIdToRemove) {
        state.chats = [];
        state.chatHistoryId = "";
        state.previousChat = [];
        state.lastQuery = "";
      }
    },
  },
});

export const chatAction = chatSlice.actions;

export default chatSlice.reducer;
