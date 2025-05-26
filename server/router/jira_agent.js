// server/router/jira_agent.js
import express from "express";
import jiraAgentController from "../controller/jiraAgentController.js";

const router = express.Router();

// Route for processing a query
router.post("/api/jira/query", jiraAgentController.processQuery);

// Route for generating a specific visualization
router.post("/api/jira/visualization", jiraAgentController.createVisualization);

router.get("/api/jira/comments/:issueKey", jiraAgentController.getAllComments);

router.post(
  "/api/jira/query-enhanced",
  jiraAgentController.processQueryEnhanced
);

// Route for sentiment analysis
router.get(
  "/api/jira/sentiment/:issueKey",
  jiraAgentController.getTicketSentiment
);

// Route for MTTR calculation
router.post("/api/jira/mttr", jiraAgentController.calculateMTTR);

// New route for direct ticket summary
router.get("/api/jira/ticket/:issueKey", jiraAgentController.getTicketSummary);
router.options("/api/jira/ticket/:issueKey", (req, res) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.sendStatus(200);
});
router.options("/api/jira/comments/:issueKey", (req, res) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.sendStatus(200);
});
export default router;
