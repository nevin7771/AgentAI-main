// server/orchestration/OrchestrationService.js
// Updated to correctly pass query string to answerGenerator.js

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

  // Create a standard response structure that the frontend expects
  const response = {
    success: true,
    status: "complete",
    query: query,
    question: query, // Some code paths check for 'question' property

    // CRITICAL: Include the result object structure that the frontend looks for first
    // This is the primary field checked by agent-actions.js
    result: {
      answer: finalAnswer,
      sources: sources,
      relatedQuestions: analysisOutput?.related_questions || [],
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
    aiStudioResult.summary || aiStudioResult.answer_text || "";
  if (summaryText) {
    const lowerSummary = summaryText.toLowerCase();
    if (
      lowerSummary.includes(USER_FALLBACK_MESSAGE_PART_1.toLowerCase()) &&
      (lowerSummary.includes(USER_FALLBACK_MESSAGE_PART_2.toLowerCase()) ||
        lowerSummary.includes(USER_FALLBACK_MESSAGE_PART_3.toLowerCase()))
    ) {
      console.log(
        "[OrchestrationService] Fallback triggered: AI Studio summary matches user-specified generic response pattern."
      );
      return true;
    }
    const genericPhrases = [
      "i can search jira for that",
      "i don't have access to specific ticket details right now",
    ];
    if (genericPhrases.some((phrase) => lowerSummary.includes(phrase))) {
      console.log(
        "[OrchestrationService] Fallback triggered: AI Studio summary contains a known generic phrase."
      );
      return true;
    }
  }
  console.log(
    "[OrchestrationService] No fallback condition met for AI Studio result. Proceeding with AI Studio response."
  );
  return false;
}

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
      options.requestedDataSource === "jira"
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
        routingDecision = `advanced_jira_query_${advancedJiraIntent.analyticsType.toLowerCase()}`;
        let serviceResponse = null;
        try {
          switch (advancedJiraIntent.analyticsType) {
            case "TICKET_SUMMARY":
              serviceResponse = await advancedJiraQueryService.getTicketSummary(
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
              // Add N and aggregatedBy for TOP_N_ISSUES if answerGenerator needs it
              ...(advancedJiraIntent.analyticsType === "TOP_N_ISSUES" && {
                N: serviceResponse.N,
                aggregatedBy: serviceResponse.aggregatedBy,
              }),
              // Add query for DATA_FOR_CHART_OR_TABLE if answerGenerator needs it
              ...(advancedJiraIntent.analyticsType ===
                "DATA_FOR_CHART_OR_TABLE" && { query: serviceResponse.query }),
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

      // If not processed by advanced service, or if it failed and we want to fallback to general routing
      if (!processedByAdvancedService) {
        routingDecision = shouldRouteDirectlyToDirectAPI(query, "jira")
          ? "direct_api_first"
          : "ai_studio_first";
        console.log(
          `[OrchestrationService] General JIRA Routing: ${routingDecision}`
        );

        if (routingDecision === "direct_api_first") {
          try {
            const directJiraResults = await jiraClient.searchIssues(
              primarySearchQuery
            );
            if (directJiraResults && directJiraResults.length > 0) {
              directJiraResults.forEach((item) => {
                combinedContexts.push({
                  ...item,
                  source: item.source || "jira_direct",
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
              const directJiraResults = await jiraClient.searchIssues(
                primarySearchQuery
              );
              if (directJiraResults && directJiraResults.length > 0) {
                directJiraResults.forEach((item) => {
                  combinedContexts.push({
                    ...item,
                    source: item.source || "jira_direct",
                  });
                });
                routingDecision = "direct_api_fallback_success";
              }
            } catch (e) {
              retrievalErrors.push({
                source: "jira_direct_exception",
                error: e.message,
              });
            }
          }
        }
      }
    } else if (targetSystem === "confluence") {
      routingDecision = shouldRouteDirectlyToDirectAPI(query, "confluence")
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
            }
          } catch (e) {
            retrievalErrors.push({
              source: "confluence_direct_exception",
              error: e.message,
            });
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

    // FIXED: Create the finalAnswerPayload with the original query string
    // Log the actual query and context to help debug
    console.log(
      `[OrchestrationService] Calling answerGenerator with query string: "${query}"`
    );
    console.log(
      `[OrchestrationService] Number of contexts: ${combinedContexts.length}`
    );

    // Call the answerGenerator with the string query first
    const finalAnswer = await generateAnswer(query, combinedContexts, {
      routing_decision: routingDecision,
      analysis_output: analysisOutput,
      log_analysis: logAnalysisResult,
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

export default { handleQuery };
