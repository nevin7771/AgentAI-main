// server/model/chatHistory.js
import mongoose from "mongoose";

const chatHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  title: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  clientId: {
    type: String,
    required: false,
  },
  type: {
    type: String,
    enum: [
      "agent",
      "simple",
      "deep",
      "jira_agent",
      "conf_agent",
      "default_agent",
    ],
    default: "agent",
  },
  chat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Chat",
    required: false,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
});

export const chatHistory = mongoose.model("ChatHistory", chatHistorySchema);
