import mongoose from "mongoose";

const Schema = mongoose.Schema;

const chatHistorySchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  chat: {
    type: Schema.Types.ObjectId,
    ref: "Chat",
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  // Add a field for client-generated IDs
  clientId: {
    type: String,
    index: true, // Add index for faster lookups
  },
  // Track the search type (simple, deep, agent)
  type: {
    type: String,
    enum: ['simple', 'deep', 'agent', null],
    default: null
  }
});

export const chatHistory = mongoose.model("ChatHistory", chatHistorySchema);
