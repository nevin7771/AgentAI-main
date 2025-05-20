// server/controller/jiraAgentController.js
import jiraAgentService from "../agents/jira_agent/jiraAgentService.js";

/**
 * Process a query and return a response
 */

const pendingRequests = new Map();

export const processQuery = async (req, res) => {
  try {
    const { query, chatHistory, clarificationResponse } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
        result: {
          answer: "Error: Query is required",
          sources: [],
        },
      });
    }

    console.log(`[JiraAgentController] Processing query: "${query}"`);

    let response;

    try {
      // Check if this is a follow-up to a clarification request
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
        response = await jiraAgentService.processQuery(
          query,
          chatHistory || []
        );
      }
    } catch (serviceError) {
      console.error("[JiraAgentController] Service error:", serviceError);

      // Create a fallback response in case of service error
      response = {
        success: false,
        error: serviceError.message,
        formattedResponse: `Error: ${serviceError.message}`,
      };
    }

    // If no response was received or response is undefined
    if (!response) {
      console.error("[JiraAgentController] Service returned no response");
      response = {
        success: false,
        error: "No response received from service",
        formattedResponse: "Error: No response received from service",
      };
    }

    // If we need clarification, return a special response
    if (response.needsClarification) {
      return res.status(200).json({
        success: true,
        needs_clarification: true,
        message: response.message || "Please provide more information",
        clarification_type: response.promptType || "general",
        // Store context for later
        metadata: {
          originalQuery: query,
          issueArea: response.issueArea,
          project: response.project,
          queryType: response.queryType,
        },
      });
    }

    // Ensure formattedResponse exists - this is the critical fix
    if (!response.formattedResponse) {
      if (response.error) {
        response.formattedResponse = `Error: ${response.error}`;
      } else if (response.message) {
        response.formattedResponse = response.message;
      } else {
        response.formattedResponse =
          "Processing complete, but no detailed response was generated.";
      }
      console.warn(
        "[JiraAgentController] Missing formattedResponse, created fallback"
      );
    }

    // Return the regular result
    return res.status(200).json({
      success: response.success !== false,
      ...response,
      // Format required fields for the frontend - ensure all required fields exist
      result: {
        answer: response.formattedResponse || "No response content available",
        sources: response.sources || [],
        visualization: response.visualization || null,
      },
    });
  } catch (error) {
    console.error("[JiraAgentController] Unhandled error:", error);

    // Catch-all error handler for unhandled exceptions
    return res.status(500).json({
      success: false,
      message: "Error processing query",
      error: error.message,
      result: {
        answer: `Error: ${error.message || "Unknown error occurred"}`,
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

/**
 * Get ticket summary
 */
// In jiraAgentController.js

/**
 * Get ticket summary
 */
export const getTicketSummary = async (req, res) => {
  try {
    const { issueKey } = req.params;

    if (!issueKey) {
      return res.status(400).json({
        success: false,
        message: "Issue key is required",
        result: { answer: "Error: Issue key is required", sources: [] },
      });
    }

    console.log(
      `[JiraAgentController] Getting summary for ticket: ${issueKey}`
    );

    // Set a timeout to ensure the request doesn't hang
    let timeoutId = setTimeout(() => {
      console.log(
        `[JiraAgentController] Request timeout for ticket ${issueKey}`
      );
      res.status(504).json({
        success: false,
        message: "Request timed out",
        result: {
          answer: "Error: Request timed out fetching ticket summary",
          sources: [],
        },
      });
    }, 30000); // 30 second timeout

    try {
      const result = await jiraAgentService.getTicketSummary(issueKey);

      // Clear the timeout since we got a response
      clearTimeout(timeoutId);

      // Log the response size for debugging
      const responseSize = JSON.stringify(result).length;
      console.log(
        `[JiraAgentController] Received response for ${issueKey} (size: ${responseSize} bytes)`
      );

      // Ensure the response has the expected format
      const response = {
        success: true,
        formattedResponse:
          result.formattedResponse || "No formatted response received",
        sources: result.sources || [],
        result: {
          answer: result.formattedResponse || "No formatted response received",
          sources: result.sources || [],
        },
        issueKey,
        ticket: result.ticket || { key: issueKey },
      };

      return res.status(200).json(response);
    } catch (serviceError) {
      // Clear the timeout since we got a response (even an error)
      clearTimeout(timeoutId);

      console.error(
        `[JiraAgentController] Service error for ${issueKey}:`,
        serviceError
      );

      return res.status(500).json({
        success: false,
        message: serviceError.message || "Unknown error",
        result: {
          answer: `Error retrieving ticket ${issueKey}: ${
            serviceError.message || "Unknown error"
          }`,
          sources: [],
        },
      });
    }
  } catch (error) {
    console.error("[JiraAgentController] Unexpected error:", error);
    return res.status(500).json({
      success: false,
      message: "Unexpected error occurred",
      result: {
        answer: `Unexpected error: ${error.message || "Unknown error"}`,
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
