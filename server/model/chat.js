import mongoose from "mongoose";

const Schema = mongoose.Schema;

const chatSchema = new Schema({
  chatHistory: {
    type: Schema.Types.ObjectId,
    ref: "ChatHistory",
  },
  messages: [
    {
      sender: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      message: {
        type: Object,
        required: true,
      },
      isSearch: {
        type: Boolean,
        default: false
      },
      searchType: {
        type: String,
        enum: ['simple', 'deep', null],
        default: null
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

export const chat = mongoose.model("Chat", chatSchema);
