// server/controller/jiraAgentController.js - ENHANCED VERSION WITH CONVERSATION CONTINUITY
import jiraAgentService from "../agents/jira_agent/jiraAgentService.js";

/**
 * ENHANCED: Process a query with conversation continuity support
 */
export const processQuery = async (req, res) => {
  try {
    const {
      query,
      chatHistory,
      clarificationResponse,
      clarificationContext,
      chatHistoryId,
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Query is required",
      });
    }

    console.log(`[JiraAgentController] Processing query: "${query}"`);
    console.log(
      `[JiraAgentController] Chat history length: ${chatHistory?.length || 0}`
    );
    console.log(
      `[JiraAgentController] Chat history ID: ${chatHistoryId || "none"}`
    );
    console.log(
      `[JiraAgentController] Clarification response: ${
        clarificationResponse || "none"
      }`
    );

    let response;

    try {
      // Check if this is a follow-up to a clarification request
      if (clarificationResponse || clarificationContext) {
        console.log(
          `[JiraAgentController] Processing clarification response: "${clarificationResponse}"`
        );

        // Create enhanced chat history with clarification context
        const enhancedChatHistory = [...(chatHistory || [])];

        if (clarificationContext) {
          // Add metadata to help track context
          enhancedChatHistory.push({
            role: "_metadata",
            message: JSON.stringify({
              metadata: {
                originalQuery: clarificationContext.originalQuery || query,
                clarificationType: clarificationContext.clarificationType,
                ...clarificationContext.metadata,
              },
            }),
          });
        }

        response = await jiraAgentService.handleClarificationResponse(
          clarificationContext?.originalQuery || query,
          clarificationResponse || query,
          enhancedChatHistory
        );
      } else {
        // Regular query processing with conversation context
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

    // ENHANCED: Handle clarification requests with better formatting
    if (response.needsClarification) {
      console.log(`[JiraAgentController] Agent needs clarification:`, {
        message: response.message,
        promptType: response.promptType,
        missingFields: response.missingFields,
      });

      return res.status(200).json({
        success: true,
        needs_clarification: true,
        needsClarification: true,
        message: response.message,
        clarification_type: response.promptType,
        // Enhanced metadata for frontend tracking
        metadata: {
          originalQuery: query,
          issueArea: response.issueArea,
          project: response.project,
          engineerName: response.engineerName,
          queryType: response.queryType,
          missingFields: response.missingFields || [],
          timestamp: new Date().toISOString(),
          chatHistoryId: chatHistoryId,
          ...response.metadata,
        },
        // Ensure the result structure exists for frontend compatibility
        result: {
          answer: response.message,
          sources: [],
          needsClarification: true,
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

    // ENHANCED: Handle successful responses
    if (response.success !== false) {
      console.log(`[JiraAgentController] Query processed successfully`);

      return res.status(200).json({
        success: true,
        message: response.message || "Query processed successfully",
        formattedResponse: response.formattedResponse,
        sources: response.sources || [],
        visualization: response.visualization || null,
        relatedQuestions: response.relatedQuestions || [],
        metadata: {
          queryType: response.queryType,
          executionTime: response.metadata?.executionTime,
          totalResults: response.metadata?.totalResults,
          jqlQueries: response.metadata?.jqlQueries,
          chatHistoryId: chatHistoryId,
          ...response.metadata,
        },
        // Properly formatted result for frontend
        result: {
          answer: response.formattedResponse || response.message || "",
          sources: response.sources || [],
          visualization: response.visualization || null,
          relatedQuestions: response.relatedQuestions || [],
          metadata: response.metadata || {},
        },
      });
    }

    // Handle error responses
    console.error(`[JiraAgentController] Query processing failed:`, response);

    return res.status(500).json({
      success: false,
      message: response.message || "Query processing failed",
      error: response.error || "Unknown error",
      result: {
        answer:
          response.formattedResponse ||
          `Error: ${response.error || response.message}`,
        sources: response.sources || [],
      },
    });
  } catch (error) {
    console.error("[JiraAgentController] Error processing query:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error while processing query",
      error: error.message,
      result: {
        answer: `Internal Error: ${error.message}`,
        sources: [],
      },
    });
  }
};

/**
 * ENHANCED: Create a visualization with better error handling
 */
export const createVisualization = async (req, res) => {
  try {
    const { visualizationType, params } = req.body;

    if (!visualizationType || !params) {
      return res.status(400).json({
        success: false,
        message: "Visualization type and parameters are required",
        result: {
          answer:
            "❌ **Missing Parameters**: Visualization type and parameters are required",
          sources: [],
        },
      });
    }

    console.log(
      `[JiraAgentController] Creating visualization: ${visualizationType}`
    );

    // Validate required parameters for visualization
    if (!params.issueArea && !params.project) {
      return res.status(400).json({
        success: false,
        message: "Issue Area and Project are required for visualization",
        result: {
          answer:
            "❌ **Missing Information**: Please specify Issue Area and Project for visualization",
          sources: [],
        },
      });
    }

    const result = await jiraAgentService.createVisualization(
      visualizationType,
      params
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "Visualization creation failed",
        result: {
          answer: `❌ **Visualization Failed**: ${result.error}`,
          sources: result.sources || [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Visualization created successfully",
      formattedResponse: result.formattedResponse,
      sources: result.sources || [],
      visualization: result.visualization,
      metadata: result.metadata || {},
      result: {
        answer: result.formattedResponse || "",
        sources: result.sources || [],
        visualization: result.visualization,
        metadata: result.metadata || {},
      },
    });
  } catch (error) {
    console.error("[JiraAgentController] Error creating visualization:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error during visualization creation",
      error: error.message,
      result: {
        answer: `❌ **Server Error**: ${error.message}`,
        sources: [],
      },
    });
  }
};

/**
 * ENHANCED: Get ticket sentiment analysis with better error handling
 */
export const getTicketSentiment = async (req, res) => {
  try {
    const { issueKey } = req.params;

    if (!issueKey) {
      return res.status(400).json({
        success: false,
        message: "Issue key is required",
        result: {
          answer: "❌ **Error**: Issue key is required",
          sources: [],
        },
      });
    }

    // Validate issue key format
    const jiraKeyPattern = /^[A-Z]+-\d+$/;
    if (!jiraKeyPattern.test(issueKey)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Jira issue key format",
        result: {
          answer: `❌ **Invalid Issue Key**: ${issueKey} is not a valid format`,
          sources: [],
        },
      });
    }

    console.log(
      `[JiraAgentController] Getting sentiment for ticket: ${issueKey}`
    );

    const result = await jiraAgentService.getSentimentAnalysis(issueKey);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        message: result.error || "Failed to analyze sentiment",
        result: {
          answer: `❌ **Sentiment Analysis Failed**: ${result.error}`,
          sources: [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Sentiment analysis completed",
      formattedResponse: result.formattedResponse,
      sources: result.sources || [],
      issueKey: result.issueKey,
      result: {
        answer: result.formattedResponse || "",
        sources: result.sources || [],
        issueKey: result.issueKey,
      },
    });
  } catch (error) {
    console.error(
      "[JiraAgentController] Error getting ticket sentiment:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error during sentiment analysis",
      error: error.message,
      result: {
        answer: `❌ **Server Error**: ${error.message}`,
        sources: [],
      },
    });
  }
};

/**
 * ENHANCED: Calculate MTTR with better error handling
 */
export const calculateMTTR = async (req, res) => {
  try {
    const params = req.body;

    console.log(`[JiraAgentController] Calculating MTTR with params:`, params);

    // Validate required parameters
    if (!params.issueArea && !params.project) {
      return res.status(400).json({
        success: false,
        message:
          "Either Issue Area or Project is required for MTTR calculation",
        result: {
          answer:
            "❌ **Missing Information**: Please specify Issue Area and/or Project for MTTR calculation",
          sources: [],
        },
      });
    }

    const result = await jiraAgentService.getMTTR(params);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || "MTTR calculation failed",
        result: {
          answer: `❌ **MTTR Calculation Failed**: ${result.error}`,
          sources: result.sources || [],
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "MTTR calculated successfully",
      formattedResponse: result.formattedResponse,
      sources: result.sources || [],
      mttr: result.mttr,
      mttrMs: result.mttrMs,
      count: result.count,
      metadata: result.metadata || {},
      result: {
        answer: result.formattedResponse || "",
        sources: result.sources || [],
        metadata: {
          mttr: result.mttr,
          mttrMs: result.mttrMs,
          count: result.count,
          ...result.metadata,
        },
      },
    });
  } catch (error) {
    console.error("[JiraAgentController] Error calculating MTTR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error during MTTR calculation",
      error: error.message,
      result: {
        answer: `❌ **Server Error**: ${error.message}`,
        sources: [],
      },
    });
  }
};

/**
 * ENHANCED: Get ticket summary with enhanced conversation support
 */
export const getTicketSummary = async (req, res) => {
  // Set CORS headers
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  try {
    const { issueKey } = req.params;

    if (!issueKey) {
      return res.status(400).json({
        success: false,
        message: "Issue key is required",
        result: {
          answer: "❌ **Error**: Issue key is required",
          sources: [],
        },
      });
    }

    // Validate issue key format
    const jiraKeyPattern = /^[A-Z]+-\d+$/;
    if (!jiraKeyPattern.test(issueKey)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Jira issue key format",
        result: {
          answer: `❌ **Invalid Issue Key**: ${issueKey} is not a valid Jira issue key format (expected: PROJECT-123)`,
          sources: [],
        },
      });
    }

    console.log(
      `[JiraAgentController] Getting summary for ticket: ${issueKey}`
    );

    const result = await jiraAgentService.getTicketSummary(issueKey);

    if (!result.success) {
      console.log(`[JiraAgentController] Ticket summary failed:`, result);

      return res.status(404).json({
        success: false,
        message: result.error || "Ticket not found",
        result: {
          answer:
            result.formattedResponse ||
            `❌ **Ticket Not Found**: ${result.error}`,
          sources: result.sources || [],
        },
      });
    }

    console.log(
      `[JiraAgentController] Ticket summary successful for ${issueKey}`
    );

    return res.status(200).json({
      success: true,
      message: "Ticket summary retrieved successfully",
      formattedResponse: result.formattedResponse,
      sources: result.sources || [],
      relatedQuestions: result.relatedQuestions || [],
      metadata: {
        issueKey: issueKey,
        ticket: result.ticket,
        ...result.metadata,
      },
      // Properly formatted result for frontend
      result: {
        answer: result.formattedResponse || "",
        sources: result.sources || [],
        visualization: null,
        relatedQuestions: result.relatedQuestions || [],
        metadata: {
          issueKey: issueKey,
          ticket: result.ticket,
          ...result.metadata,
        },
      },
    });
  } catch (error) {
    console.error("[JiraAgentController] Error getting ticket summary:", error);

    const issueKey = req.params.issueKey || "unknown";

    return res.status(500).json({
      success: false,
      message: "Internal server error while getting ticket summary",
      error: error.message,
      result: {
        answer: `❌ **Server Error**: Failed to retrieve summary for ${issueKey}. ${error.message}`,
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
