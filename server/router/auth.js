import express from "express";

const routes = express.Router();

import {
  oktaAuthHandler,
  loginValidation,
  logoutHandler,
  refreshToken,
} from "../controller/auth.js";
import { authMiddleware } from "../middleware/auth.js";

routes.get("/api/auth/okta/callback", authMiddleware, oktaAuthHandler);
routes.get("/api/auth/login", loginValidation);
routes.get("/api/auth/logout", authMiddleware, logoutHandler);
routes.get("/api/auth/resetToken", refreshToken);

export default routes;
