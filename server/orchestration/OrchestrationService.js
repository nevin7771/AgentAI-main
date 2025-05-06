// server/orchestration/OrchestrationService.js
// Updated for parallel querying

import aiStudioClient from "../clients/aiStudioClient.js";
import jiraClient from "../clients/jiraClient.js";
import confluenceClient from "../clients/confluenceClient.js";
import { analyzeLogs } from "../log_analysis/logAnalyzer.js";
import { analyzeQuery } from "./queryAnalyzer.js";
import { generateAnswer } from "./answerGenerator.js"; // This will be enhanced later for combination
// import { processContext } from "./contextProcessor.js"; // Placeholder for context processing

/**
 * Main orchestration function to handle user queries based on the AI Studio flow.
 * Updated to query direct APIs and AI Studio in parallel.
 *
 * @param {string} query - The user\s query.
 * @param {Array} chatHistory - The conversation history.
 * @param {object} options - Additional options (e.g., requestedDataSource: \'jira\").
 * @param {string|null} logInput - Direct log content or path to an uploaded log file, if any.
 * @returns {Promise<object>} - A promise resolving to the final result object for the user.
 */
const handleQuery = async (
  query,
  chatHistory = [],
  options = {},
  logInput = null
) => {
  console.log(`[OrchestrationService] Handling query: "${query}"`);
  const startTime = Date.now();

  try {
    // --- Step 1: Log Analysis (if applicable) ---
    let logAnalysisResult = null;
    if (logInput) {
      console.log(
        `[OrchestrationService] Log input provided. Performing log analysis.`
      );
      try {
        logAnalysisResult = await analyzeLogs(logInput);
        console.log(
          "[OrchestrationService] Log analysis result:",
          logAnalysisResult
        );
        if (logAnalysisResult && logAnalysisResult.tracking_id) {
          query = `${query} (Log Tracking ID: ${logAnalysisResult.tracking_id})`;
          console.log(
            `[OrchestrationService] Modified query with Tracking ID: "${query}"`
          );
        }
      } catch (logError) {
        console.error("[OrchestrationService] Log analysis failed:", logError);
        logAnalysisResult = {
          error: `Log analysis failed: ${logError.message}`,
        };
      }
    }

    // --- Step 2: Query Analysis (LLM 1) ---
    console.log("[OrchestrationService] Performing query analysis (LLM 1)... ");
    const analysisOutput = await analyzeQuery(query, chatHistory);
    console.log(
      "[OrchestrationService] Query analysis output:",
      analysisOutput
    );
    const searchQueries = analysisOutput.search_queries || [query];
    const primarySearchQuery = searchQueries[0]; // Use the first query for simplicity

    // --- Step 3: Parallel Knowledge Retrieval ---
    console.log("[OrchestrationService] Retrieving knowledge in parallel...");
    let retrievalPromises = [];
    let directApiSource = null;
    let aiStudioAgentId = null;

    // Determine which direct API and AI Studio agent to query
    if (primarySearchQuery.toLowerCase().includes("jira") || query.toLowerCase().includes("jira")) {
      directApiSource = "jira";
      aiStudioAgentId = "jira_ag";
      console.log(
        `[OrchestrationService] Targeting JIRA (Direct) and AI Studio Agent (${aiStudioAgentId})`
      );
      
      // Log that we're about to call the Jira client
      console.log(`[OrchestrationService] Calling jiraClient.searchIssues with query: "${primarySearchQuery}"`);
      
      // Use a more detailed wrapper for the jiraClient call to enhance logging
      const jiraDirectApiCall = async () => {
        try {
          console.log('[OrchestrationService] Starting Jira search...');
          const results = await jiraClient.searchIssues(primarySearchQuery);
          console.log(`[OrchestrationService] Jira search complete, found ${results.length} results`);
          return results;
        } catch (e) {
          console.error('[OrchestrationService] Jira search failed:', e);
          return { source: "jira_direct", error: e.message };
        }
      };
      
      retrievalPromises.push(jiraDirectApiCall());
      
      console.log(`[OrchestrationService] Calling aiStudioClient.queryAgent for agent: ${aiStudioAgentId}`);
      retrievalPromises.push(
        aiStudioClient
          .queryAgent([primarySearchQuery], query, chatHistory, aiStudioAgentId)
          .catch((e) => {
            console.error(`[OrchestrationService] AI Studio Agent (${aiStudioAgentId}) query failed:`, e);
            return { source: "aistudio_jira", error: e.message };
          })
      );
    } else if (primarySearchQuery.toLowerCase().includes("confluence")) {
      directApiSource = "confluence";
      aiStudioAgentId = "conf_ag";
      console.log(
        `[OrchestrationService] Targeting Confluence (Direct) and AI Studio Agent (${aiStudioAgentId})`
      );
      retrievalPromises.push(
        confluenceClient
          .searchPages(primarySearchQuery)
          .catch((e) => ({ source: "confluence_direct", error: e.message }))
      );
      retrievalPromises.push(
        aiStudioClient
          .queryAgent([primarySearchQuery], query, chatHistory, aiStudioAgentId)
          .catch((e) => ({ source: "aistudio_confluence", error: e.message }))
      );
    } else {
      // Default: Only query the default AI Studio agent if no specific target identified
      aiStudioAgentId = "default"; // Or determine a better default agent
      console.log(
        `[OrchestrationService] No specific target identified, querying default AI Studio Agent (${aiStudioAgentId})`
      );
      retrievalPromises.push(
        aiStudioClient
          .queryAgent([primarySearchQuery], query, chatHistory, aiStudioAgentId)
          .catch((e) => ({ source: "aistudio_default", error: e.message }))
      );
    }

    // Execute all retrieval promises in parallel
    const retrievalResults = await Promise.all(retrievalPromises);
    console.log(
      "[OrchestrationService] Parallel retrieval results received:",
      retrievalResults
    );

    // Flatten results and filter out errors (or handle them)
    let combinedContexts = [];
    let retrievalErrors = [];
    retrievalResults.forEach((result) => {
      if (Array.isArray(result)) {
        combinedContexts.push(...result);
      } else if (result.error) {
        retrievalErrors.push(result);
        console.warn(
          `[OrchestrationService] Error retrieving from source ${result.source}: ${result.error}`
        );
      }
    });
    console.log(
      `[OrchestrationService] Combined ${combinedContexts.length} context items from parallel sources.`
    );
    if (retrievalErrors.length > 0) {
      console.warn(
        `[OrchestrationService] Encountered ${retrievalErrors.length} errors during retrieval.`
      );
      // Optionally include error info in the final response
    }

    // --- Step 4: Context Processing (Code) ---
    console.log("[OrchestrationService] Processing combined context...");
    // TODO: Enhance context processing if needed
    const processedContext = combinedContexts
      .map(
        (ctx, index) =>
          `<context item="${index + 1}" source="${
            ctx.search_engine || ctx.source || "unknown"
          }">
<title>${ctx.title || "N/A"}</title>
<summary>${ctx.summary || ctx.description || "N/A"}</summary>
<chunks>${(ctx.chunks || ctx.comments || []).join("\n")}</chunks>
${ctx.url ? `<url>${ctx.url}</url>` : ""}
${ctx.extra ? `<extra>${JSON.stringify(ctx.extra)}</extra>` : ""}
</context>`
      )
      .join("\n\n");
    console.log(
      "[OrchestrationService] Processed context length:",
      processedContext.length
    );

    // --- Step 5: Answer Generation & Combination (LLM 2 - To be Enhanced) ---
    console.log("[OrchestrationService] Generating final answer (LLM 2)...");
    // TODO: Enhance generateAnswer to specifically handle combining results from multiple sources
    const finalAnswer = await generateAnswer(
      query,
      processedContext,
      analysisOutput
    );
    console.log("[OrchestrationService] Final answer generated.");

    // --- Step 6: Output Parsing ---
    const formattedOutput = finalAnswer; // Basic for now

    const endTime = Date.now();
    console.log(
      `[OrchestrationService] Query handled in ${endTime - startTime}ms`
    );

    // Include retrieval errors in the response if any occurred
    const responsePayload = {
      success: true,
      query: query,
      analysis: analysisOutput,
      retrieved_sources_count: combinedContexts.length,
      processed_context_preview: processedContext.substring(0, 500) + "...",
      final_answer: formattedOutput,
      log_analysis: logAnalysisResult,
    };
    if (retrievalErrors.length > 0) {
      responsePayload.retrieval_errors = retrievalErrors;
    }

    return responsePayload;
  } catch (error) {
    console.error("[OrchestrationService] Error handling query:", error);
    return {
      success: false,
      query: query,
      error: error.message || "An unknown error occurred during orchestration.",
    };
  }
};

export default {
  handleQuery,
};
