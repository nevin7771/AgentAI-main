// server/controller/jiraAgentController.js - ENHANCED VERSION
import jiraAgentService from "../agents/jira_agent/jiraAgentService.js";

/**
 * Process any Jira query - comprehensive handler
 */
export const processQuery = async (req, res) => {
  try {
    const { query, chatHistory, clarificationResponse } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    console.log(
      `[JiraAgentController] Processing comprehensive query: "${query}"`
    );

    let response;

    // Handle clarification responses
    if (clarificationResponse) {
      console.log(
        `[JiraAgentController] Processing clarification response: "${clarificationResponse}"`
      );
      response = await jiraAgentService.handleClarificationResponse(
        query,
        clarificationResponse,
        chatHistory || []
      );
    } else {
      // Main comprehensive processing
      response = await jiraAgentService.processQuery(query, chatHistory || []);
    }

    // Handle clarification requests
    if (response.needsClarification) {
      return res.status(200).json({
        success: true,
        needs_clarification: true,
        message: response.message,
        clarification_type: response.promptType,
        metadata: response.metadata || {
          originalQuery: query,
          queryType: response.queryType,
        },
      });
    }

    // Standard successful response
    console.log(`[JiraAgentController] Processing complete:`, {
      hasResponse: !!response.formattedResponse,
      responseLength: response.formattedResponse?.length || 0,
      sourcesCount: response.sources?.length || 0,
      hasVisualization: !!response.visualization,
      queryType: response.queryType,
    });

    // Ensure we have a response
    if (
      !response.formattedResponse ||
      response.formattedResponse.trim() === ""
    ) {
      console.warn(
        `[JiraAgentController] Empty response from service for query: "${query}"`
      );
      response.formattedResponse =
        "The query was processed but no content was generated. Please try rephrasing your question.";
    }

    return res.status(200).json({
      success: true,

      // Multiple access paths for frontend compatibility
      formattedResponse: response.formattedResponse,

      result: {
        answer: response.formattedResponse,
        sources: response.sources || [],
        visualization: response.visualization || null,
        relatedQuestions: response.relatedQuestions || [],
      },

      // Top-level fields
      sources: response.sources || [],
      relatedQuestions: response.relatedQuestions || [],
      visualization: response.visualization || null,

      // Metadata
      queryType: response.queryType,
      metadata: response.metadata || {},
    });
  } catch (error) {
    console.error("[JiraAgentController] Error processing query:", error);

    // Return structured error response
    return res.status(500).json({
      success: false,
      message: "Error processing Jira query",
      error: error.message,

      // Ensure frontend gets expected structure even on error
      result: {
        answer: `Error processing your Jira query: ${error.message}`,
        sources: [],
        visualization: null,
        relatedQuestions: [],
      },

      formattedResponse: `Error processing your Jira query: ${error.message}`,
      sources: [],
      relatedQuestions: [],
    });
  }
};

/**
 * Create a specific visualization
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

    // This could be enhanced to work with the new comprehensive service
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

    // Use the comprehensive service for sentiment analysis
    const query = `Perform sentiment analysis on ticket ${issueKey}`;
    const result = await jiraAgentService.processQuery(query);

    return res.status(200).json({
      success: true,
      formattedResponse: result.formattedResponse,
      sources: result.sources,
      result: {
        answer: result.formattedResponse,
        sources: result.sources,
      },
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

    // Use the comprehensive service for MTTR analysis
    const query = `Calculate MTTR analysis ${
      params.timeframe ? `for ${params.timeframe}` : ""
    } ${params.issueArea ? `in ${params.issueArea}` : ""}`;
    const result = await jiraAgentService.processQuery(query);

    return res.status(200).json({
      success: true,
      formattedResponse: result.formattedResponse,
      sources: result.sources,
      visualization: result.visualization,
      result: {
        answer: result.formattedResponse,
        sources: result.sources,
        visualization: result.visualization,
      },
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

/**
 * Get ticket summary - now uses comprehensive service
 */
export const getTicketSummary = async (req, res) => {
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

    // Use the comprehensive service
    const query = `Summarize Jira ticket ${issueKey}`;
    const result = await jiraAgentService.processQuery(query);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error || "Failed to get ticket summary",
        result: {
          answer: `Error: ${result.error || "Unknown error"}`,
          sources: [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      formattedResponse: result.formattedResponse,
      sources: result.sources,
      relatedQuestions: result.relatedQuestions,

      result: {
        answer: result.formattedResponse,
        sources: result.sources,
        visualization: result.visualization,
        relatedQuestions: result.relatedQuestions,
      },

      issueKey: issueKey,
      queryType: result.queryType,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("[JiraAgentController] Error getting ticket summary:", error);
    return res.status(500).json({
      success: false,
      message: "Error getting ticket summary",
      error: error.message,
      result: {
        answer: `Error: ${error.message}`,
        sources: [],
      },
    });
  }
};

// Export all methods
export default {
  processQuery,
  createVisualization,
  getTicketSentiment,
  calculateMTTR,
  getTicketSummary,
};
