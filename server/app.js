// server/app.js - Updated version to include the enhanced agent router
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import requestIp from "request-ip";
import cors from "cors";
import publicRoutes from "./router/public.js";
import authRoutes from "./router/auth.js";
import agentRouter from "./router/agent.js";

// Verify environment variables are loaded
console.log("Environment check:");
console.log("OKTA_DOMAIN:", process.env.OKTA_DOMAIN ? "***" : "undefined");
console.log(
  "OKTA_CLIENT_ID:",
  process.env.OKTA_CLIENT_ID ? "***" : "undefined"
);
console.log("OKTA_REDIRECT_URI:", process.env.OKTA_REDIRECT_URI);
console.log(
  "OPENAI_API_KEY:",
  process.env.OPENAI_API_KEY ? "***" : "undefined"
);

const MONGODB_URL =
  process.env.MONGODB_URL || `mongodb://localhost:27017/gemini`;
const PORT_NO = 3030;

const app = express();

app.use(express.json());
app.use(requestIp.mw());

const originUrl = process.env.CLIENT_REDIRECT_URL;

const corsOption = {
  origin: originUrl || "http://localhost:3030", // Frontend URL (no trailing slash)
  optionsSuccessStatus: 200,
  credentials: true, // Essential for cookies
};

app.use(cors(corsOption));

// Routes
app.use("/gemini", publicRoutes);
app.use(authRoutes);
app.use(agentRouter); // Add the agent router which includes deep-research endpoint
app.use(agentRouter);

app.use((error, req, res, next) => {
  console.log(error);
  const status = error.statusCode || 500;
  const message = error.message;
  const data = error.data;

  res.status(status).json({ message: message, data: data, error: error });
});

mongoose
  .connect(MONGODB_URL)
  .then((result) => {
    app.listen(process.env.PORT || PORT_NO, () => {
      console.log(`Gemini server is running on port ${PORT_NO}`);
    });
  })
  .catch((err) => {
    console.log(err);
  });
