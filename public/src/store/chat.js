// Updated src/store/chat.js

import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  chats: [],
  newChat: false,
  isLoader: false,
  isSubmitting: false, // Add submitting state to prevent duplicates
  lastQuery: "", // Track last query to prevent duplicates
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
    recentChatHandler(state, action) {
      state.recentChat = action.payload.recentChat;
    },
    chatStart(state, action) {
      // If this is a user message and we already have this exact message
      // as the last item in the chat, don't add a duplicate
      if (
        action.payload.useInput.isLoader === "yes" &&
        state.lastQuery === action.payload.useInput.user
      ) {
        console.log(
          "Preventing duplicate message:",
          action.payload.useInput.user
        );
        return;
      }

      // Store this as the last query if it's a user message
      if (action.payload.useInput.user) {
        state.lastQuery = action.payload.useInput.user;
      }

      // Add the chat message
      state.chats.push({
        user: action.payload.useInput.user,
        isLoader: action.payload.useInput.isLoader,
        gemini: action.payload.useInput.gemini,
        id: Math.random(),
        newChat: true,
        isSearch: action.payload.useInput.isSearch || false,
        searchType: action.payload.useInput.searchType || null,
      });
    },
    popChat(state) {
      state.chats.pop();
    },
    previousChatHandler(state, action) {
      state.previousChat.push(
        action.payload.previousChat[0],
        action.payload.previousChat[1]
      );
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
    // New reducers for submission state
    setSubmitting(state, action) {
      state.isSubmitting = action.payload;
    },
    clearLastQuery(state) {
      state.lastQuery = "";
    },
  },
});

export const chatAction = chatSlice.actions;

export default chatSlice.reducer;
