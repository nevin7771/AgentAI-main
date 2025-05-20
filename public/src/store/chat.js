import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  chats: [],
  showScrollBottom: false,
  recentChat: [],
  previousChat: [],
  newChat: false,
  chatHistoryId: null,
  geminiBackendOption: "Gemini",
  suggestPrompt: "",
};

const chatSlice = createSlice({
  name: "chat",
  initialState: initialState,
  reducers: {
    chatStart(state, action) {
      const newMessage = {
        id: new Date().getTime().toString(),
        user: action.payload.useInput.user,
        gemini: action.payload.useInput.gemini,
        isLoader: action.payload.useInput.isLoader,
        isSearch: action.payload.useInput.isSearch || false,
        searchType: action.payload.useInput.searchType,
        usedCache: action.payload.useInput.usedCache,
        queryKeywords: action.payload.useInput.queryKeywords || [],
        sources: action.payload.useInput.sources || [],
        relatedQuestions: action.payload.useInput.relatedQuestions || [],
        isPreformattedHTML: action.payload.useInput.isPreformattedHTML || false,
        error: action.payload.useInput.error || false,
        streamingId: action.payload.useInput.streamingId || null, // Add streamingId for streaming updates
      };
      state.chats.push(newMessage);
    },

    // New reducer for updating streaming chat messages
    updateStreamingChat(state, action) {
      const { streamingId, content, isComplete } = action.payload;

      // Find the streaming message by its unique ID
      const messageIndex = state.chats.findIndex(
        (chat) => chat.streamingId === streamingId
      );

      if (messageIndex !== -1) {
        // Update the content
        state.chats[messageIndex].gemini = content;

        // If the stream is complete, change the loader state
        if (isComplete) {
          state.chats[messageIndex].isLoader = "no";
        }
      }
    },

    newChatHandler(state) {
      state.previousChat = [];
      state.newChat = !state.newChat;
    },
    replaceChat(state, action) {
      // This action replaces the current chat with a new one
      // Used when clicking the logo to reset the chat
      state.chats = action.payload.chats || [];
    },
    suggestPromptHandler(state, action) {
      console.log("suggestPromptHandler called with payload:", action.payload);
      // Make sure we handle null/undefined properly
      if (action.payload && typeof action.payload.prompt === "string") {
        state.suggestPrompt = action.payload.prompt;
      } else {
        state.suggestPrompt = "";
      }
      console.log("suggestPrompt state after update:", state.suggestPrompt);
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
      state.previousChat = action.payload.previousChat;
    },

    getChatHandler(state, action) {
      state.chats = action.payload.chats;
    },

    popChat(state) {
      state.chats = state.chats.filter((c) => c.isLoader !== "yes");
    },

    scrollHandler(state, action) {
      state.showScrollBottom = action.payload.value;
    },

    removeChatHistory(state, action) {
      state.recentChat = state.recentChat.filter(
        (c) => c._id !== action.payload.chatId
      );
    },
  },
});

export const chatAction = chatSlice.actions;

export default chatSlice.reducer;
