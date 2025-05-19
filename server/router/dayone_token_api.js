import express from "express";
import { authMiddleware } from "../middleware/auth.js";
import { getDayOneToken } from "../controller/dayone_token_api.js";

const router = express.Router();

// Apply auth middleware to protect token endpoint
router.use(authMiddleware);

// Endpoint to get the existing Day One token
router.get("/api/dayone/token", getDayOneToken);

export default router;
