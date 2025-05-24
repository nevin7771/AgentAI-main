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
      state.newChat = false;
    },
    replaceChat(state, action) {
      state.chats = action.payload.chats;
    },
    getChatHandler(state, action) {
      state.chats = action.payload.chats || [];
    },
    recentChatHandler(state, action) {
      state.recentChat = action.payload.recentChat;
    },
    chatStart(state, action) {
      const newMessage = action.payload.useInput;

      // ENHANCED: Comprehensive deduplication logic
      if (newMessage.isLoader === "yes") {
        // Check for exact duplicate loading messages
        const isDuplicateLoading = state.chats.some(
          (chat) =>
            chat.isLoader === "yes" &&
            chat.user === newMessage.user &&
            chat.searchType === newMessage.searchType &&
            Math.abs(new Date(chat.timestamp).getTime() - Date.now()) < 5000 // Within 5 seconds
        );

        if (isDuplicateLoading) {
          console.log(
            "[chatStart] Preventing exact duplicate loading message for:",
            newMessage.user
          );
          return;
        }

        // Check lastQuery condition
        if (state.lastQuery === newMessage.user) {
          console.log(
            "[chatStart] Preventing duplicate based on lastQuery:",
            newMessage.user
          );
          return;
        }
      }

      // For non-loading messages, prevent duplicates within a short time window
      if (newMessage.isLoader !== "yes") {
        const recentDuplicate = state.chats.find(
          (chat) =>
            chat.user === newMessage.user &&
            chat.gemini === newMessage.gemini &&
            chat.isLoader === newMessage.isLoader &&
            Math.abs(new Date(chat.timestamp).getTime() - Date.now()) < 2000 // Within 2 seconds
        );

        if (recentDuplicate) {
          console.log(
            "[chatStart] Preventing recent duplicate message:",
            newMessage.user
          );
          return;
        }
      }

      // Update lastQuery if this is a user message
      if (newMessage.user) {
        state.lastQuery = newMessage.user;
      }

      // Add the new message
      const messageToAdd = {
        user: newMessage.user,
        isLoader: newMessage.isLoader,
        gemini: newMessage.gemini,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // More unique ID
        newChat: true,
        isSearch: newMessage.isSearch || false,
        searchType: newMessage.searchType || null,
        queryKeywords: newMessage.queryKeywords || [],
        sources: newMessage.sources || [],
        relatedQuestions: newMessage.relatedQuestions || [],
        isPreformattedHTML: newMessage.isPreformattedHTML || false,
        error: newMessage.error || null,
        timestamp: newMessage.timestamp || new Date().toISOString(),
      };

      console.log(`[chatStart] Adding message:`, {
        user: messageToAdd.user,
        isLoader: messageToAdd.isLoader,
        searchType: messageToAdd.searchType,
        id: messageToAdd.id,
      });

      state.chats.push(messageToAdd);
    },
    popChat(state) {
      if (state.chats.length > 0) {
        const removed = state.chats.pop();
        console.log(`[popChat] Removed message:`, {
          user: removed.user,
          isLoader: removed.isLoader,
          id: removed.id,
        });
      }
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
    removeChatHistory(state, action) {
      const chatIdToRemove = action.payload.chatId;
      state.recentChat = state.recentChat.filter(
        (chat) => chat._id !== chatIdToRemove
      );
      if (state.chatHistoryId === chatIdToRemove) {
        state.chats = [];
        state.chatHistoryId = "";
        state.previousChat = [];
        state.lastQuery = "";
      }
    },
    updateChatContent(state, action) {
      const { searchType, content, replaceContent } = action.payload;

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
      }
    },
    clearLoadingMessages(state) {
      const before = state.chats.length;
      state.chats = state.chats.filter((chat) => chat.isLoader !== "yes");
      const after = state.chats.length;
      console.log(
        `[clearLoadingMessages] Removed ${before - after} loading messages`
      );
    },
    clearLoadingMessagesByType(state, action) {
      const { searchType } = action.payload;
      const before = state.chats.length;
      state.chats = state.chats.filter(
        (chat) => !(chat.isLoader === "yes" && chat.searchType === searchType)
      );
      const after = state.chats.length;
      console.log(
        `[clearLoadingMessagesByType] Removed ${
          before - after
        } loading messages for type: ${searchType}`
      );
    },
  },
});

export const chatAction = chatSlice.actions;
export default chatSlice.reducer;
