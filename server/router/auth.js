import express from "express";
const routes = express.Router();

import {
  oktaAuthHandler,
  loginValidation,
  logoutHandler,
  refreshToken,
  getUserInfo,
} from "../controller/auth.js";

import { authMiddleware } from "../middleware/auth.js";

routes.get("/api/auth/okta/callback", oktaAuthHandler); // removed middleware to allow initial login
routes.get("/api/auth/login", loginValidation);
routes.get("/api/auth/logout", authMiddleware, logoutHandler);
routes.get("/api/auth/resetToken", refreshToken);

// ✅ New route
routes.get("/api/auth/me", authMiddleware, getUserInfo);

export default routes;
