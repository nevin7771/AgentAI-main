// server/agents/jira_agent/index.js
// Main entry point for the Jira agent

import { Router } from "express";
import jiraAgentController from "./jiraAgentController.js";

const router = Router();

// Route for processing general queries
router.post("/api/jira/query", jiraAgentController.processQuery);

// Route for ticket summaries
router.get("/api/jira/ticket/:issueKey", jiraAgentController.getTicketSummary);

// Route for sentiment analysis
router.get(
  "/api/jira/sentiment/:issueKey",
  jiraAgentController.getTicketSentiment
);

// Route for MTTR calculations
router.post("/api/jira/mttr", jiraAgentController.calculateMTTR);

// Route for visualizations
router.post("/api/jira/visualization", jiraAgentController.createVisualization);

export default router;
