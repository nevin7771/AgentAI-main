// server/orchestration/OrchestrationService.js
// Enhanced with proper context restoration for follow-up queries

import aiStudioClient from "../clients/aiStudioClient.js";
import jiraClient from "../clients/jiraClient.js";
import confluenceClient from "../clients/confluenceClient.js";
import { analyzeLogs } from "../log_analysis/logAnalyzer.js";
import { analyzeQuery } from "./queryAnalyzer.js";
import { generateAnswer } from "./answerGenerator.js";
import { shouldRouteDirectlyToDirectAPI } from "./routingAnalyzer.js";
import advancedJiraQueryService from "../services/advancedJiraQueryService.js";

// Fallback criteria constants
const FALLBACK_CONFIDENCE_THRESHOLD = 0.6;
const USER_FALLBACK_MESSAGE_PART_1 =
  "i apologize, but i don't have any specific information";
const USER_FALLBACK_MESSAGE_PART_2 =
  "retrieved contents do not contain any direct references";
const USER_FALLBACK_MESSAGE_PART_3 =
  "cannot provide a summary or any details about it";
const USER_FALLBACK_MESSAGE_PART_4 =
  "Unfortunately, there are no specific details available";

/**
 * Processes the final results from all knowledge sources and formats them consistently
 * for the frontend.
 *
 * @param {string} finalAnswer - The final generated answer content
 * @param {string} query - The original user query
 * @param {Array} combinedContexts - The combined context information from all sources
 * @param {string} routingDecision - The routing decision that was made
 * @param {object} analysisOutput - Query analysis output (optional)
 * @param {object} logAnalysisResult - Optional log analysis results
 * @returns {object} - A consistently formatted response object
 */
const formatFinalResponse = (
  finalAnswer,
  query,
  combinedContexts,
  routingDecision,
  analysisOutput = null,
  logAnalysisResult = null
) => {
  console.log(
    `[OrchestrationService] Formatting final response for frontend, routing: ${routingDecision}`
  );

  // Format combinedContexts into a sources array format expected by frontend
  const sources = combinedContexts.map((ctx) => ({
    title: ctx.title || (ctx.source ? `Source from ${ctx.source}` : "Source"),
    url: ctx.url || null,
    snippet: ctx.summary || ctx.content || "",
    favicon: ctx.favicon || null,
  }));

  // Check if this is a clarification request needing user input
  const needsUserInput = combinedContexts.some(
    (ctx) => ctx.needs_user_input === true
  );

  // Create a standard response structure that the frontend expects
  const response = {
    success: true,
    status: needsUserInput ? "needs_clarification" : "complete",
    query: query,
    question: query, // Some code paths check for 'question' property

    // CRITICAL: Include the result object structure that the frontend looks for first
    // This is the primary field checked by agent-actions.js
    result: {
      answer: finalAnswer,
      sources: sources,
      relatedQuestions: analysisOutput?.related_questions || [],
      needsUserInput: needsUserInput,
      missingInfo:
        combinedContexts.find((ctx) => ctx.needs_user_input)?.missing_info ||
        null,
    },

    // Also include these fields for backward compatibility
    final_answer: finalAnswer,
    retrieval_contexts: combinedContexts,
    routing_decision: routingDecision,

    // Include this for original code paths
    formattedHtml: null,

    // Add timestamp
    timestamp: new Date().toISOString(),
  };

  // Include analysis output if provided
  if (analysisOutput) {
    response.analysis_output = analysisOutput;
  }

  // Include log analysis if provided
  if (logAnalysisResult) {
    response.log_analysis_result = logAnalysisResult;
  }

  console.log(
    `[OrchestrationService] Response formatted for frontend with ${sources.length} sources`
  );
  return response;
};

/**
 * Enhanced function to determine if a fallback to Direct API is needed based on AI Studio results
 *
 * @param {object} aiStudioResult - The result from AI Studio
 * @returns {boolean} - True if fallback is needed, false otherwise
 */
function function_is_fallback_needed(aiStudioResult) {
  if (!aiStudioResult) {
    console.log(
      "[OrchestrationService] Fallback triggered: No AI Studio result provided."
    );
    return true;
  }

  if (aiStudioResult.error) {
    console.log(
      "[OrchestrationService] Fallback triggered: AI Studio result has an error flag.",
      aiStudioResult.summary
    );
    return true;
  }

  if (aiStudioResult.requires_direct_api_fallback === true) {
    console.log(
      "[OrchestrationService] Fallback triggered: Explicit 'requires_direct_api_fallback' flag is true."
    );
    return true;
  }

  if (
    aiStudioResult.extra &&
    aiStudioResult.extra.requires_direct_api_fallback === true
  ) {
    console.log(
      "[OrchestrationService] Fallback triggered: Explicit 'requires_direct_api_fallback' flag is true in 'extra' field."
    );
    return true;
  }

  const confidenceScore =
    aiStudioResult.confidence_score !== undefined
      ? aiStudioResult.confidence_score
      : aiStudioResult.extra
      ? aiStudioResult.extra.confidence_score
      : undefined;

  if (
    confidenceScore !== undefined &&
    confidenceScore < FALLBACK_CONFIDENCE_THRESHOLD
  ) {
    console.log(
      `[OrchestrationService] Fallback triggered: Confidence score ${confidenceScore} is below threshold ${FALLBACK_CONFIDENCE_THRESHOLD}.`
    );
    return true;
  }

  const foundSpecificData =
    aiStudioResult.found_specific_data !== undefined
      ? aiStudioResult.found_specific_data
      : aiStudioResult.extra
      ? aiStudioResult.extra.found_specific_data
      : undefined;

  if (foundSpecificData === false) {
    console.log(
      "[OrchestrationService] Fallback triggered: 'found_specific_data' flag is false."
    );
    return true;
  }

  const summaryText =
    aiStudioResult.summary ||
    aiStudioResult.answer_text ||
    aiStudioResult.answer ||
    "";

  if (summaryText) {
    const lowerSummary = summaryText.toLowerCase();

    // Check for general "I don't know" type responses
    if (
      lowerSummary.includes(USER_FALLBACK_MESSAGE_PART_1.toLowerCase()) &&
      (lowerSummary.includes(USER_FALLBACK_MESSAGE_PART_2.toLowerCase()) ||
        lowerSummary.includes(USER_FALLBACK_MESSAGE_PART_3.toLowerCase()) ||
        lowerSummary.includes(USER_FALLBACK_MESSAGE_PART_4.toLowerCase()))
    ) {
      console.log(
        "[OrchestrationService] Fallback triggered: AI Studio summary matches user-specified generic response pattern."
      );
      return true;
    }

    // Enhanced generic phrases detection
    const genericPhrases = [
      "i can search jira for that",
      "i don't have access to specific ticket details right now",
      "i would need to search jira",
      "i don't have specific information about",
      "i couldn't find specific information",
      "i don't have direct access to jira",
      "i don't have current jira data",
      "to get accurate information you should check jira",
      "to get the most current information",
      "to see the latest tickets",
      "i can't access the specific details",
      "without access to your organization's jira",
      "i'm not able to search jira directly",
      "i would need more information",
    ];

    if (genericPhrases.some((phrase) => lowerSummary.includes(phrase))) {
      console.log(
        "[OrchestrationService] Fallback triggered: AI Studio summary contains a known generic phrase."
      );
      return true;
    }

    // Check for overly general summary without specific ticket numbers
    if (
      (lowerSummary.includes("jira") || lowerSummary.includes("issue")) &&
      !/[A-Z]+-\d+/.test(summaryText) && // No ticket IDs
      summaryText.length > 300 && // Long explanation
      (lowerSummary.includes("summary") ||
        lowerSummary.includes("identified issues"))
    ) {
      console.log(
        "[OrchestrationService] Fallback triggered: AI Studio provided general summary without specific tickets."
      );
      return true;
    }

    // Check for responses about theoretical topics instead of actual data
    if (
      (lowerSummary.includes("generally speaking") ||
        lowerSummary.includes("typically") ||
        lowerSummary.includes("in general")) &&
      !/[A-Z]+-\d+/.test(summaryText) // No ticket IDs
    ) {
      console.log(
        "[OrchestrationService] Fallback triggered: AI Studio provided theoretical response without specific data."
      );
      return true;
    }
  }

  console.log(
    "[OrchestrationService] No fallback condition met for AI Studio result. Proceeding with AI Studio response."
  );
  return false;
}

/**
 * Helper function to check for AI summary language related queries
 *
 * @param {string} query - The query to check
 * @returns {boolean} - True if the query is likely about AI summary language issues
 */
function isAiSummaryLanguageQuery(query) {
  // Convert to lowercase for easier matching
  const queryLower = query.toLowerCase();

  // Count matches for key terms related to AI summary language issues
  let matchCount = 0;
  const keyTerms = [
    "ai summary",
    "meeting summary",
    "incorrect language",
    "wrong language",
    "language spoken",
    "language issue",
    "transcription",
    "transcript",
  ];

  keyTerms.forEach((term) => {
    if (queryLower.includes(term)) matchCount++;
  });

  // Return true if multiple key terms are found or specific combinations exist
  if (matchCount >= 2) return true;

  // Check for specific combinations
  if (
    (queryLower.includes("ai summary") && queryLower.includes("language")) ||
    (queryLower.includes("meeting") && queryLower.includes("language")) ||
    (queryLower.includes("transcript") && queryLower.includes("language"))
  ) {
    return true;
  }

  return false;
}

/**
 * Updates chat history with metadata about the current query, such as query type or missing parameters
 * This helps maintain context for follow-up queries
 *
 * @param {Array} chatHistory - The chat history array
 * @param {object} metadata - The metadata to store
 */
function storeMetadataInChatHistory(chatHistory, metadata) {
  if (!chatHistory || !Array.isArray(chatHistory)) return;

  // Store as a special entry that won't be displayed to the user
  chatHistory.push({
    role: "_metadata",
    message: JSON.stringify({
      metadata: metadata,
      timestamp: new Date().toISOString(),
    }),
  });

  console.log(
    "[OrchestrationService] Stored metadata in chat history:",
    metadata
  );
}

/**
 * Retrieves the original query and context from chat history metadata
 *
 * @param {Array} chatHistory - The conversation history
 * @returns {object|null} - The original query context or null if not found
 */
function getOriginalQueryFromChatHistory(chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory)) return null;

  // Look for the metadata entry containing the original query
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "_metadata") {
      try {
        const data = JSON.parse(chatHistory[i].message);
        if (data.metadata && data.metadata.originalQuery) {
          return {
            query: data.metadata.originalQuery,
            missingInfo: data.metadata.missingInfo,
            intentType: data.metadata.intentType,
          };
        }
      } catch (e) {
        console.warn("[OrchestrationService] Error parsing metadata:", e);
      }
    }
  }

  return null;
}

/**
 * Main handler function for processing user queries
 */
const handleQuery = async (
  query,
  chatHistory = [],
  options = {},
  logInput = null
) => {
  console.log(
    `[OrchestrationService] Handling query: "${query}" with options:`,
    options
  );
  const startTime = Date.now();
  let logAnalysisResult = null;
  let combinedContexts = [];
  let retrievalErrors = [];
  let routingDecision = "ai_studio_first";
  let needsUserInput = false;
  let userInputPrompt = "";
  let originalQueryContext = null;

  try {
    if (logInput) {
      console.log(
        "[OrchestrationService] Log input provided. Performing log analysis."
      );
      try {
        logAnalysisResult = await analyzeLogs(logInput);
        if (logAnalysisResult && logAnalysisResult.tracking_id) {
          query = `${query} (Log Tracking ID: ${logAnalysisResult.tracking_id})`;
        }
      } catch (logError) {
        console.error("[OrchestrationService] Log analysis failed:", logError);
        logAnalysisResult = {
          error: `Log analysis failed: ${logError.message}`,
        };
      }
    }

    // First, determine if this is a follow-up to a previous clarification request
    const isFollowUpToClarification = checkForClarificationFollowUp(
      query,
      chatHistory
    );

    // If this is a follow-up response to a clarification, try to restore the original context
    if (isFollowUpToClarification) {
      console.log(
        "[OrchestrationService] Follow-up response detected, restoring original context"
      );

      // Retrieve original query from metadata in chat history
      originalQueryContext = getOriginalQueryFromChatHistory(chatHistory);

      if (originalQueryContext) {
        console.log(
          `[OrchestrationService] Restored original query: ${originalQueryContext.query}`
        );

        // Create enhanced query combining original intent with the clarification response
        if (originalQueryContext.missingInfo === "issue_area") {
          // For Issue Area clarifications, construct a query that includes the project name
          const enhancedQuery = `${originalQueryContext.query} for project ${query}`;
          console.log(
            `[OrchestrationService] Enhanced query: ${enhancedQuery}`
          );

          // Replace the simple response with the enhanced query for processing
          query = enhancedQuery;
        } else if (originalQueryContext.missingInfo === "issue_key") {
          // For specific tickets, include the ticket number
          const enhancedQuery = `${originalQueryContext.query} ${query}`;
          console.log(
            `[OrchestrationService] Enhanced query: ${enhancedQuery}`
          );
          query = enhancedQuery;
        } else if (originalQueryContext.missingInfo === "user_name") {
          // For user-specific queries
          const enhancedQuery = `${originalQueryContext.query} for user ${query}`;
          console.log(
            `[OrchestrationService] Enhanced query: ${enhancedQuery}`
          );
          query = enhancedQuery;
        } else if (
          originalQueryContext.missingInfo === "client_name" ||
          originalQueryContext.missingInfo === "release_version"
        ) {
          // For client/version specific queries
          const enhancedQuery = `${originalQueryContext.query} for ${query}`;
          console.log(
            `[OrchestrationService] Enhanced query: ${enhancedQuery}`
          );
          query = enhancedQuery;
        }
      }
    }

    console.log("[OrchestrationService] Performing query analysis (LLM 1)... ");
    const analysisOutput = await analyzeQuery(query, chatHistory);
    const searchQueries = analysisOutput.search_queries || [query];
    const primarySearchQuery = searchQueries[0];
    const queryLower = primarySearchQuery.toLowerCase();
    const originalQueryLower = query.toLowerCase();
    let targetSystem = null;

    if (
      queryLower.includes("jira") ||
      originalQueryLower.includes("jira") ||
      originalQueryLower.includes("zsee") || // Assuming ZSEE is Jira related
      options.requestedDataSource === "jira" ||
      isFollowUpToClarification // If following up on a clarification, likely Jira
    ) {
      targetSystem = "jira";
    } else if (
      queryLower.includes("confluence") ||
      originalQueryLower.includes("confluence") ||
      originalQueryLower.includes("wiki") ||
      options.requestedDataSource === "confluence"
    ) {
      targetSystem = "confluence";
    } else {
      targetSystem = "default";
    }

    console.log(
      `[OrchestrationService] Determined target system: ${targetSystem}`
    );

    let processedByAdvancedService = false;

    if (targetSystem === "jira") {
      // Try Advanced Jira Service first for specific analytical queries
      const advancedJiraIntent =
        await advancedJiraQueryService.understandJiraQuery(query, chatHistory);

      if (
        advancedJiraIntent &&
        advancedJiraIntent.analyticsType &&
        advancedJiraIntent.analyticsType !== "GENERAL_JQL_QUERY"
      ) {
        console.log(
          `[OrchestrationService] Advanced Jira query type identified: ${advancedJiraIntent.analyticsType}`
        );

        // Check if we need user input for this query
        if (advancedJiraIntent.analyticsType === "NEEDS_CLARIFICATION") {
          needsUserInput = true;
          userInputPrompt =
            advancedJiraIntent.prompt ||
            "I need more information to answer your question. Could you provide more details?";

          // Store the original query and intent in the chat history for context
          storeMetadataInChatHistory(chatHistory, {
            originalQuery: query,
            intentType: advancedJiraIntent.analyticsType,
            missingInfo: advancedJiraIntent.missingInfo,
            queryContext: advancedJiraIntent.queryContext || {},
          });

          // Create a response asking for more information
          combinedContexts.push({
            summary: userInputPrompt,
            source: "advanced_jira_service_clarification",
            title: "Clarification Needed",
            needs_user_input: true,
            missing_info: advancedJiraIntent.missingInfo,
            original_query: query, // Store original query for context
          });

          routingDecision = "advanced_jira_query_needs_clarification";
          processedByAdvancedService = true;
        } else {
          routingDecision = `advanced_jira_query_${advancedJiraIntent.analyticsType.toLowerCase()}`;
          let serviceResponse = null;
          try {
            switch (advancedJiraIntent.analyticsType) {
              case "TICKET_SUMMARY":
                serviceResponse =
                  await advancedJiraQueryService.getTicketSummary(
                    advancedJiraIntent.parameters.issueKey
                  );
                break;
              case "MTTR_CALCULATION":
                serviceResponse = await advancedJiraQueryService.getMTTR(
                  advancedJiraIntent.parameters
                );
                break;
              case "TOP_N_ISSUES":
                serviceResponse = await advancedJiraQueryService.getTopNIssues(
                  advancedJiraIntent.parameters
                );
                break;
              case "BUG_GENERATION_ANALYSIS":
                serviceResponse =
                  await advancedJiraQueryService.getBugGenerationAnalysis(
                    advancedJiraIntent.parameters
                  );
                break;
              case "DATA_FOR_CHART_OR_TABLE":
                serviceResponse =
                  await advancedJiraQueryService.getDataForChartOrTable(
                    advancedJiraIntent.parameters
                  );
                break;
              case "SENTIMENT_ANALYSIS":
                serviceResponse =
                  await advancedJiraQueryService.getSentimentAnalysis(
                    advancedJiraIntent.parameters
                  );
                break;
              default:
                console.warn(
                  `[OrchestrationService] Unhandled advanced analytics type: ${advancedJiraIntent.analyticsType}`
                );
                break;
            }

            if (serviceResponse && serviceResponse.success) {
              console.log(
                "[OrchestrationService] Advanced Jira service processed successfully."
              );
              combinedContexts.push({
                summary: `Advanced Jira Analysis: ${advancedJiraIntent.analyticsType}`,
                raw_data: serviceResponse.data,
                presentation_hint: serviceResponse.presentationHint,
                source: `advanced_jira_service_${advancedJiraIntent.analyticsType.toLowerCase()}`,
                title: `Advanced Jira Analysis: ${advancedJiraIntent.analyticsType}`,
                contextInfo: serviceResponse.contextInfo || null,
                isFollowUpResponse:
                  advancedJiraIntent.parameters?.isFollowUpResponse || false,
                original_project:
                  advancedJiraIntent.parameters?.originalProject || null,
                // Add N and aggregatedBy for TOP_N_ISSUES if answerGenerator needs it
                ...(advancedJiraIntent.analyticsType === "TOP_N_ISSUES" && {
                  N: serviceResponse.N,
                  aggregatedBy: serviceResponse.aggregatedBy,
                }),
                // Add query for DATA_FOR_CHART_OR_TABLE if answerGenerator needs it
                ...(advancedJiraIntent.analyticsType ===
                  "DATA_FOR_CHART_OR_TABLE" && {
                  query: serviceResponse.query,
                }),
                // For follow-ups, include original query context
                ...(isFollowUpToClarification &&
                  originalQueryContext && {
                    original_query_context: originalQueryContext,
                  }),
              });
              processedByAdvancedService = true;
            } else if (serviceResponse) {
              console.warn(
                "[OrchestrationService] Advanced Jira service failed:",
                serviceResponse.error
              );
              retrievalErrors.push({
                source: `advanced_jira_service_${advancedJiraIntent.analyticsType.toLowerCase()}`,
                error: serviceResponse.error,
              });
            }
          } catch (advError) {
            console.error(
              "[OrchestrationService] Error calling advanced Jira service:",
              advError
            );
            retrievalErrors.push({
              source: `advanced_jira_service_exception_${advancedJiraIntent.analyticsType.toLowerCase()}`,
              error: advError.message,
            });
          }
        }
      }

      // If not processed by advanced service, or if it failed and we want to fallback to general routing
      if (!processedByAdvancedService) {
        // Check if the query involves AI summary language issues - force Direct API for these
        const isSummaryLanguageQuery = isAiSummaryLanguageQuery(query);

        // If this is a follow-up to a clarification, force Direct API routing
        if (isFollowUpToClarification) {
          routingDecision = "direct_api_first";
          console.log(
            "[OrchestrationService] Follow-up to clarification detected, routing to Direct API"
          );
        } else if (isSummaryLanguageQuery) {
          routingDecision = "direct_api_first";
          console.log(
            "[OrchestrationService] AI summary language query detected, routing to Direct API"
          );
        } else {
          // Otherwise, use the normal routing analyzer
          routingDecision = shouldRouteDirectlyToDirectAPI(
            query,
            "jira",
            chatHistory
          )
            ? "direct_api_first"
            : "ai_studio_first";
        }

        console.log(
          `[OrchestrationService] General JIRA Routing: ${routingDecision}`
        );

        if (routingDecision === "direct_api_first") {
          try {
            // For follow-ups, make sure to pass original context if available
            let searchContext = {};
            if (isFollowUpToClarification && originalQueryContext) {
              searchContext = {
                original_query: originalQueryContext.query,
                response_value: query,
              };
            }

            const directJiraResults = await jiraClient.searchIssues(
              isFollowUpToClarification
                ? {
                    query: primarySearchQuery,
                    context: searchContext,
                  }
                : primarySearchQuery
            );

            if (directJiraResults && directJiraResults.length > 0) {
              directJiraResults.forEach((item) => {
                combinedContexts.push({
                  ...item,
                  source: item.source || "jira_direct",
                  ...(isFollowUpToClarification &&
                    originalQueryContext && {
                      original_query_context: originalQueryContext,
                    }),
                });
              });
              routingDecision = "direct_api_success";
            } else {
              console.log(
                "[OrchestrationService] Direct JIRA API (first) returned no results. Falling back to AI Studio."
              );
              const aiStudioResultsArray = await aiStudioClient.queryAgent(
                [primarySearchQuery],
                query,
                chatHistory,
                "jira_ag"
              );
              if (
                aiStudioResultsArray &&
                aiStudioResultsArray.length > 0 &&
                !aiStudioResultsArray[0].error
              ) {
                combinedContexts.push({
                  ...aiStudioResultsArray[0],
                  source:
                    aiStudioResultsArray[0].source ||
                    aiStudioResultsArray[0].search_engine ||
                    "aistudio_jira",
                });
                routingDecision = "ai_studio_fallback_success";
              } else {
                retrievalErrors.push({
                  source: "aistudio_jira_error",
                  error:
                    (aiStudioResultsArray &&
                      aiStudioResultsArray[0] &&
                      aiStudioResultsArray[0].summary) ||
                    "AI Studio Jira Error",
                });
                routingDecision = "both_services_failed";
              }
            }
          } catch (e) {
            console.error(
              "[OrchestrationService] Direct JIRA API (first) failed, trying AI Studio:",
              e
            );
            retrievalErrors.push({
              source: "jira_direct_exception",
              error: e.message,
            });
            try {
              const aiStudioResultsArray = await aiStudioClient.queryAgent(
                [primarySearchQuery],
                query,
                chatHistory,
                "jira_ag"
              );
              if (
                aiStudioResultsArray &&
                aiStudioResultsArray.length > 0 &&
                !aiStudioResultsArray[0].error
              ) {
                combinedContexts.push({
                  ...aiStudioResultsArray[0],
                  source:
                    aiStudioResultsArray[0].source ||
                    aiStudioResultsArray[0].search_engine ||
                    "aistudio_jira",
                });
                routingDecision = "ai_studio_fallback_success";
              } else {
                retrievalErrors.push({
                  source: "aistudio_jira_error",
                  error:
                    (aiStudioResultsArray &&
                      aiStudioResultsArray[0] &&
                      aiStudioResultsArray[0].summary) ||
                    "AI Studio Jira Error",
                });
                routingDecision = "both_services_failed";
              }
            } catch (e2) {
              retrievalErrors.push({
                source: "aistudio_jira_exception",
                error: e2.message,
              });
              routingDecision = "both_services_failed";
            }
          }
        } else {
          // ai_studio_first for Jira
          let aiStudioJiraResult = null;
          try {
            const aiStudioResultsArray = await aiStudioClient.queryAgent(
              [primarySearchQuery],
              query,
              chatHistory,
              "jira_ag"
            );
            if (aiStudioResultsArray && aiStudioResultsArray.length > 0) {
              aiStudioJiraResult = aiStudioResultsArray[0];
              if (!aiStudioJiraResult.error) {
                combinedContexts.push({
                  ...aiStudioJiraResult,
                  source:
                    aiStudioJiraResult.source ||
                    aiStudioJiraResult.search_engine ||
                    "aistudio_jira",
                });
                routingDecision = "ai_studio_success";
              } else {
                retrievalErrors.push({
                  source: "aistudio_jira_error",
                  error: aiStudioJiraResult.summary || "AI Studio Jira Error",
                });
                if (!aiStudioJiraResult)
                  aiStudioJiraResult = {
                    error: true,
                    summary: "AI Studio Jira Error",
                  };
              }
            }
          } catch (e) {
            retrievalErrors.push({
              source: "aistudio_jira_exception",
              error: e.message,
            });
            aiStudioJiraResult = { error: true, summary: e.message };
          }

          if (function_is_fallback_needed(aiStudioJiraResult)) {
            console.log(
              "[OrchestrationService] Fallback to Direct JIRA API triggered."
            );
            try {
              // If AI Studio result was saved, clear it since we're falling back
              if (
                combinedContexts.length > 0 &&
                combinedContexts[0].source &&
                combinedContexts[0].source.includes("aistudio")
              ) {
                console.log(
                  "[OrchestrationService] Clearing AI Studio results before fallback"
                );
                combinedContexts = [];
              }

              // For follow-ups, make sure to pass original context if available
              let searchContext = {};
              if (isFollowUpToClarification && originalQueryContext) {
                searchContext = {
                  original_query: originalQueryContext.query,
                  response_value: query
                    .replace(originalQueryContext.query, "")
                    .trim(),
                };
              }

              const directJiraResults = await jiraClient.searchIssues(
                isFollowUpToClarification
                  ? {
                      query: primarySearchQuery,
                      context: searchContext,
                    }
                  : primarySearchQuery
              );

              if (directJiraResults && directJiraResults.length > 0) {
                directJiraResults.forEach((item) => {
                  combinedContexts.push({
                    ...item,
                    source: item.source || "jira_direct",
                    ...(isFollowUpToClarification &&
                      originalQueryContext && {
                        original_query_context: originalQueryContext,
                      }),
                  });
                });
                routingDecision = "direct_api_fallback_success";
              } else {
                console.log(
                  "[OrchestrationService] Direct JIRA API fallback returned no results"
                );
                // If we cleared AI Studio results but Direct API also failed, add a no results context
                if (combinedContexts.length === 0) {
                  combinedContexts.push({
                    title: "No Results Found",
                    summary: `Neither AI Studio nor Direct JIRA API found results for "${query}"`,
                    source: "no_results",
                    is_error: false,
                  });
                }
              }
            } catch (e) {
              retrievalErrors.push({
                source: "jira_direct_exception",
                error: e.message,
              });
              // If we cleared AI Studio results but Direct API failed, restore a general error context
              if (combinedContexts.length === 0) {
                combinedContexts.push({
                  title: "Error in Fallback",
                  summary: `AI Studio provided insufficient information, and Direct JIRA API failed: ${e.message}`,
                  source: "fallback_error",
                  is_error: true,
                });
              }
            }
          }
        }
      }
    } else if (targetSystem === "confluence") {
      routingDecision = shouldRouteDirectlyToDirectAPI(
        query,
        "confluence",
        chatHistory
      )
        ? "direct_api_first"
        : "ai_studio_first";
      console.log(
        `[OrchestrationService] Confluence Routing: ${routingDecision}`
      );

      if (routingDecision === "direct_api_first") {
        try {
          const directConfluenceResults = await confluenceClient.searchPages(
            primarySearchQuery
          );
          if (directConfluenceResults && directConfluenceResults.length > 0) {
            directConfluenceResults.forEach((item) => {
              combinedContexts.push({
                ...item,
                source: item.source || "confluence_direct",
              });
            });
            routingDecision = "direct_api_success";
          } else {
            const aiStudioResultsArray = await aiStudioClient.queryAgent(
              [primarySearchQuery],
              query,
              chatHistory,
              "conf_ag"
            );
            if (
              aiStudioResultsArray &&
              aiStudioResultsArray.length > 0 &&
              !aiStudioResultsArray[0].error
            ) {
              combinedContexts.push({
                ...aiStudioResultsArray[0],
                source:
                  aiStudioResultsArray[0].source ||
                  aiStudioResultsArray[0].search_engine ||
                  "aistudio_confluence",
              });
              routingDecision = "ai_studio_fallback_success";
            } else {
              retrievalErrors.push({
                source: "aistudio_confluence_error",
                error:
                  (aiStudioResultsArray &&
                    aiStudioResultsArray[0] &&
                    aiStudioResultsArray[0].summary) ||
                  "AI Studio Confluence Error",
              });
              routingDecision = "both_services_failed";
            }
          }
        } catch (e) {
          retrievalErrors.push({
            source: "confluence_direct_exception",
            error: e.message,
          });
          // Fallback to AI Studio
          try {
            const aiStudioResultsArray = await aiStudioClient.queryAgent(
              [primarySearchQuery],
              query,
              chatHistory,
              "conf_ag"
            );
            if (
              aiStudioResultsArray &&
              aiStudioResultsArray.length > 0 &&
              !aiStudioResultsArray[0].error
            ) {
              combinedContexts.push({
                ...aiStudioResultsArray[0],
                source:
                  aiStudioResultsArray[0].source ||
                  aiStudioResultsArray[0].search_engine ||
                  "aistudio_confluence",
              });
              routingDecision = "ai_studio_fallback_success";
            } else {
              retrievalErrors.push({
                source: "aistudio_confluence_error",
                error:
                  (aiStudioResultsArray &&
                    aiStudioResultsArray[0] &&
                    aiStudioResultsArray[0].summary) ||
                  "AI Studio Confluence Error",
              });
              routingDecision = "both_services_failed";
            }
          } catch (e2) {
            retrievalErrors.push({
              source: "aistudio_confluence_exception",
              error: e2.message,
            });
            routingDecision = "both_services_failed";
          }
        }
      } else {
        // ai_studio_first for Confluence
        let aiStudioConfluenceResult = null;
        try {
          const aiStudioResultsArray = await aiStudioClient.queryAgent(
            [primarySearchQuery],
            query,
            chatHistory,
            "conf_ag"
          );
          if (aiStudioResultsArray && aiStudioResultsArray.length > 0) {
            aiStudioConfluenceResult = aiStudioResultsArray[0];
            if (!aiStudioConfluenceResult.error) {
              combinedContexts.push({
                ...aiStudioConfluenceResult,
                source:
                  aiStudioConfluenceResult.source ||
                  aiStudioConfluenceResult.search_engine ||
                  "aistudio_confluence",
              });
              routingDecision = "ai_studio_success";
            } else {
              retrievalErrors.push({
                source: "aistudio_confluence_error",
                error:
                  aiStudioConfluenceResult.summary ||
                  "AI Studio Confluence Error",
              });
              if (!aiStudioConfluenceResult)
                aiStudioConfluenceResult = {
                  error: true,
                  summary: "AI Studio Confluence Error",
                };
            }
          }
        } catch (e) {
          retrievalErrors.push({
            source: "aistudio_confluence_exception",
            error: e.message,
          });
          aiStudioConfluenceResult = { error: true, summary: e.message };
        }

        if (function_is_fallback_needed(aiStudioConfluenceResult)) {
          // Clear AI Studio results for replacing with Direct API results
          if (
            combinedContexts.length > 0 &&
            combinedContexts[0].source &&
            combinedContexts[0].source.includes("aistudio")
          ) {
            console.log(
              "[OrchestrationService] Clearing AI Studio results before fallback"
            );
            combinedContexts = [];
          }

          try {
            const directConfluenceResults = await confluenceClient.searchPages(
              primarySearchQuery
            );
            if (directConfluenceResults && directConfluenceResults.length > 0) {
              directConfluenceResults.forEach((item) => {
                combinedContexts.push({
                  ...item,
                  source: item.source || "confluence_direct",
                });
              });
              routingDecision = "direct_api_fallback_success";
            } else {
              // No results from Direct API in fallback
              if (combinedContexts.length === 0) {
                combinedContexts.push({
                  title: "No Results Found",
                  summary: `Neither AI Studio nor Direct Confluence API found results for "${query}"`,
                  source: "no_results",
                  is_error: false,
                });
              }
            }
          } catch (e) {
            retrievalErrors.push({
              source: "confluence_direct_exception",
              error: e.message,
            });
            if (combinedContexts.length === 0) {
              combinedContexts.push({
                title: "Error in Fallback",
                summary: `AI Studio provided insufficient information, and Direct Confluence API failed: ${e.message}`,
                source: "fallback_error",
                is_error: true,
              });
            }
          }
        }
      }
    } else {
      // Default agent (AI Studio only)
      routingDecision = "ai_studio_default";
      try {
        const aiStudioResultsArray = await aiStudioClient.queryAgent(
          searchQueries,
          query,
          chatHistory,
          options.agentId || "default_agent" // Use default_agent or a general purpose one
        );
        if (aiStudioResultsArray && aiStudioResultsArray.length > 0) {
          aiStudioResultsArray.forEach((item) => {
            if (!item.error) {
              combinedContexts.push({
                ...item,
                source: item.source || item.search_engine || "aistudio_default",
              });
            }
          });
        }
      } catch (e) {
        retrievalErrors.push({
          source: "aistudio_default_exception",
          error: e.message,
        });
      }
    }

    console.log(
      `[OrchestrationService] Knowledge retrieval complete with routing decision: ${routingDecision}`
    );
    console.log(
      `[OrchestrationService] Combined ${combinedContexts.length} context items for answer generation.`
    );

    if (combinedContexts.length === 0 && retrievalErrors.length > 0) {
      // If no contexts were successfully retrieved, use the first error as the primary message
      combinedContexts.push({
        summary: `Failed to retrieve information. Error: ${retrievalErrors[0].error}`,
        source: retrievalErrors[0].source,
        is_error: true,
      });
    }

    // If this is a query that needs user input, return that directly
    if (needsUserInput) {
      console.log(
        "[OrchestrationService] Query needs user input. Returning clarification prompt."
      );
      const finalAnswer = userInputPrompt;
      const endTime = Date.now();
      console.log(
        `[OrchestrationService] Query handled in ${
          endTime - startTime
        }ms (needs user input)`
      );

      return formatFinalResponse(
        finalAnswer,
        query,
        combinedContexts,
        routingDecision,
        analysisOutput,
        logAnalysisResult
      );
    }

    // FIXED: Create the finalAnswerPayload with the original query string
    // Log the actual query and context to help debug
    console.log(
      `[OrchestrationService] Calling answerGenerator with query string: "${query}"`
    );
    console.log(
      `[OrchestrationService] Number of contexts: ${combinedContexts.length}`
    );

    // Check for AI summary language query to force concise ticket-focused response
    const enforceTicketFocusedResponse = isAiSummaryLanguageQuery(query);
    if (enforceTicketFocusedResponse) {
      console.log(
        "[OrchestrationService] Enforcing ticket-focused formatting for AI summary language query"
      );
    }

    // Add the query type information to the context for answerGenerator
    combinedContexts.forEach((ctx) => {
      if (!ctx.queryTypeInfo) {
        ctx.queryTypeInfo = {
          isAiSummaryLanguageQuery: isAiSummaryLanguageQuery(query),
          isTopIssuesQuery: /top\s+\d+\s+issues?|top\s+issues?/i.test(query),
          isMttrQuery:
            /mttr|mean time to resolution|average resolution time/i.test(query),
          isBugListQuery: /bug\s+list|bugs reported|reported bugs/i.test(query),
          isSentimentAnalysisQuery: /sentiment|feeling|emotion|tone/i.test(
            query
          ),
          isVisualizationQuery:
            /chart|graph|pie|visualize|table|summarize/i.test(query),
          isFollowUpToClarification: isFollowUpToClarification,
          originalQueryContext: originalQueryContext,
        };
      }
    });

    // Call the answerGenerator with the string query first
    const finalAnswer = await generateAnswer(query, combinedContexts, {
      routing_decision: routingDecision,
      analysis_output: analysisOutput,
      log_analysis: logAnalysisResult,
      enforce_ticket_focused: enforceTicketFocusedResponse,
      is_follow_up: isFollowUpToClarification,
      original_context: originalQueryContext,
    });

    const endTime = Date.now();
    console.log(
      `[OrchestrationService] Query handled in ${endTime - startTime}ms`
    );

    // FIXED: Use the new formatFinalResponse function to ensure consistent frontend-compatible structure
    return formatFinalResponse(
      finalAnswer,
      query,
      combinedContexts,
      routingDecision,
      analysisOutput,
      logAnalysisResult
    );
  } catch (error) {
    console.error(
      "[OrchestrationService] Unhandled error in handleQuery:",
      error
    );
    const endTime = Date.now();
    console.log(
      `[OrchestrationService] Query failed in ${endTime - startTime}ms`
    );

    // FIXED: Format error responses consistently too, with the actual query string
    return formatFinalResponse(
      `I encountered an error trying to process your request: ${error.message}`,
      query, // Use the actual query string!
      // Include any contexts that were collected before the error
      combinedContexts.length > 0
        ? combinedContexts
        : [
            {
              summary: error.message,
              source: "error",
              is_error: true,
            },
          ],
      routingDecision,
      null,
      logAnalysisResult
    );
  }
};

/**
 * Determines if a query is a follow-up to a previous clarification request
 *
 * @param {string} query - The current query
 * @param {Array} chatHistory - The conversation history
 * @returns {boolean} - True if this appears to be a follow-up to a clarification
 */
function checkForClarificationFollowUp(query, chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length < 2) {
    return false;
  }

  // Find the last assistant message
  let lastAssistantIndex = -1;
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "assistant") {
      lastAssistantIndex = i;
      break;
    }
  }

  if (lastAssistantIndex === -1) return false;

  const lastAssistantMessage = chatHistory[lastAssistantIndex].message;
  const isSimpleResponse = query.trim().split(/\s+/).length <= 3;

  // Check if the last message contained clarification phrases
  const clarificationPhrases = [
    "Which Issue Area",
    "Which project",
    "Which Jira ticket",
    "Which specific Jira ticket",
    "Which client would you",
    "Which release or version",
    "Which user would you",
  ];

  const containsClarificationRequest = clarificationPhrases.some((phrase) =>
    lastAssistantMessage.includes(phrase)
  );

  return containsClarificationRequest && isSimpleResponse;
}

export default { handleQuery };
