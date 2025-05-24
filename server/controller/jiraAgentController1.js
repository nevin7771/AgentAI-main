// server/controller/jiraAgentController.js
import jiraAgentService from "../agents/jira_agent/jiraAgentService.js";

/**
 * Process a query and return a response
 */
export const processQuery = async (req, res) => {
  try {
    const { query, chatHistory } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    console.log(`[JiraAgentController] Processing query: "${query}"`);

    const response = await jiraAgentService.processQuery(
      query,
      chatHistory || []
    );

    // Return the result
    return res.status(200).json({
      success: true,
      ...response,
      // Format required fields for the frontend
      result: {
        answer: response.formattedResponse || response.answer || "",
        sources: response.sources || [],
        visualization: response.visualization || null,
      },
    });
  } catch (error) {
    console.error("[JiraAgentController] Error processing query:", error);
    return res.status(500).json({
      success: false,
      message: "Error processing query",
      error: error.message,
      // Include formatted error for frontend
      result: {
        answer: `Error: ${error.message}`,
        sources: [],
      },
    });
  }
};

/**
 * Create a visualization
 */
export const createVisualization = async (req, res) => {
  try {
    const { visualizationType, params } = req.body;

    if (!visualizationType || !params) {
      return res.status(400).json({
        success: false,
        message: "Visualization type and parameters are required",
      });
    }

    console.log(
      `[JiraAgentController] Creating visualization: ${visualizationType}`
    );

    const result = await jiraAgentService.createVisualization(
      visualizationType,
      params
    );

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[JiraAgentController] Error creating visualization:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating visualization",
      error: error.message,
    });
  }
};

/**
 * Get ticket sentiment analysis
 */
export const getTicketSentiment = async (req, res) => {
  try {
    const { issueKey } = req.params;

    if (!issueKey) {
      return res.status(400).json({
        success: false,
        message: "Issue key is required",
      });
    }

    console.log(
      `[JiraAgentController] Getting sentiment for ticket: ${issueKey}`
    );

    const result = await jiraAgentService.getSentimentAnalysis(issueKey);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "[JiraAgentController] Error getting ticket sentiment:",
      error
    );
    return res.status(500).json({
      success: false,
      message: "Error getting ticket sentiment",
      error: error.message,
    });
  }
};

/**
 * Calculate MTTR
 */
export const calculateMTTR = async (req, res) => {
  try {
    const params = req.body;

    console.log(`[JiraAgentController] Calculating MTTR`);

    const result = await jiraAgentService.getMTTR(params);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[JiraAgentController] Error calculating MTTR:", error);
    return res.status(500).json({
      success: false,
      message: "Error calculating MTTR",
      error: error.message,
    });
  }
};

export const getTicketSummary = async (req, res) => {
  // Set CORS headers explicitly
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  try {
    const { issueKey } = req.params;

    if (!issueKey) {
      return res.status(400).json({
        success: false,
        message: "Issue key is required",
      });
    }

    console.log(
      `[JiraAgentController] Getting summary for ticket: ${issueKey}`
    );

    const result = await jiraAgentService.getTicketSummary(issueKey);

    return res.status(200).json({
      success: true,
      ...result,
      // Format required fields for the frontend
      result: {
        answer: result.formattedResponse || result.answer || "",
        sources: result.sources || [],
        visualization: result.visualization || null,
      },
    });
  } catch (error) {
    console.error("[JiraAgentController] Error getting ticket summary:", error);
    return res.status(500).json({
      success: false,
      message: "Error getting ticket summary",
      error: error.message,
      // Include formatted error for frontend
      result: {
        answer: `Error: ${error.message}`,
        sources: [],
      },
    });
  }
};

// Make sure you're exporting the new function in the default export
export default {
  processQuery,
  createVisualization,
  getTicketSentiment,
  calculateMTTR,
  getTicketSummary, // Add this line to include the new function
};
