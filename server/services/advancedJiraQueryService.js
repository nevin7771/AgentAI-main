// server/services/advancedJiraQueryService.js
// Enhanced version with improved query understanding, follow-up handling, and result formatting

import jiraClient from "../clients/jiraClient.js"; // Assuming path
import { generateJqlQuery } from "../orchestration/jqlGenerator.js"; // Assuming path
import {
  calculateMTTR,
  groupAndCount,
  formatDataForTable,
  analyzeLinkedIssues,
  formatMillisToDaysHoursMinutes,
} from "../utils/jiraDataProcessor.js"; // Assuming path

// Utility for sentiment analysis
const sentimentScores = {
  positive: [
    "good",
    "great",
    "excellent",
    "happy",
    "satisfied",
    "pleased",
    "fantastic",
    "amazing",
    "wonderful",
    "resolved",
    "fixed",
    "working",
    "success",
    "successful",
    "approve",
    "approved",
    "done",
    "completed",
  ],
  negative: [
    "bad",
    "issue",
    "problem",
    "fail",
    "failed",
    "not working",
    "dissatisfied",
    "unhappy",
    "broken",
    "bug",
    "error",
    "crash",
    "disappointed",
    "wrong",
    "doesn't work",
    "terrible",
    "awful",
    "horrible",
    "poor",
    "reject",
    "rejected",
    "incomplete",
  ],
};

// Common project/issue area names for better matching in follow-up queries
const knownProjectNames = [
  "desktop client",
  "desktop clients",
  "zsee",
  "mobile",
  "web",
  "zoom rooms",
  "zr",
  "api",
  "backend",
  "frontend",
  "scheduler",
  "cloud",
  "recording",
  "transcription",
  "audio",
  "video",
  "ui",
  "telephony",
  "events",
  "webinar",
];

/**
 * Enhanced function to understand natural language queries about Jira
 * and convert them to actionable intent with parameters.
 *
 * @param {string} naturalLanguageQuery - The user's query in natural language.
 * @param {Array} chatHistory - The conversation history.
 * @returns {Promise<object>} - A promise resolving to an object with query type and parameters.
 */
async function understandJiraQuery(naturalLanguageQuery, chatHistory) {
  console.log(
    `[advancedJiraQueryService] Understanding query: ${naturalLanguageQuery}`
  );

  const queryLower = naturalLanguageQuery.toLowerCase();

  // Check for follow-up responses to clarification requests
  const clarificationResponse = checkForClarificationResponse(
    naturalLanguageQuery,
    chatHistory
  );
  if (clarificationResponse) {
    console.log(
      "[advancedJiraQueryService] Detected follow-up to clarification request:",
      clarificationResponse
    );
    return clarificationResponse;
  }

  // Extract any mentioned JIRA issue keys
  const issueKeyRegex = /([A-Z]+-\d+)/g;
  const issueKeys = naturalLanguageQuery.match(issueKeyRegex) || [];

  // Check for sentiment analysis request
  if (
    (queryLower.includes("sentiment") ||
      queryLower.includes("feeling") ||
      queryLower.includes("emotion") ||
      queryLower.includes("tone")) &&
    (queryLower.includes("ticket") ||
      queryLower.includes("issue") ||
      issueKeys.length > 0)
  ) {
    // Extract ticket key if present, otherwise prompt for one
    if (issueKeys.length > 0) {
      return {
        analyticsType: "SENTIMENT_ANALYSIS",
        parameters: { issueKey: issueKeys[0] },
      };
    } else {
      return {
        analyticsType: "NEEDS_CLARIFICATION",
        missingInfo: "issue_key",
        prompt:
          "Which specific Jira ticket would you like to analyze the sentiment for?",
      };
    }
  }

  // Check for AI summary language specific queries
  if (isAiSummaryLanguageQuery(queryLower)) {
    console.log(
      "[advancedJiraQueryService] Detected AI summary language query"
    );
    return {
      analyticsType: "GENERAL_JQL_QUERY",
      parameters: {
        naturalLanguageQuery,
        specificJqlQuery: buildAiSummaryJqlQuery(),
        presentationHint: "ticket_list",
      },
    };
  }

  // 1. Check for explicit ticket summary request
  if (
    issueKeys.length > 0 &&
    (queryLower.includes("summary") ||
      queryLower.includes("details") ||
      queryLower.includes("about") ||
      queryLower.includes("tell me about"))
  ) {
    return {
      analyticsType: "TICKET_SUMMARY",
      parameters: { issueKey: issueKeys[0] },
    };
  }

  // 2. Check for MTTR calculation request
  if (
    queryLower.includes("mttr") ||
    queryLower.includes("mean time to resolution") ||
    queryLower.includes("mean time to respond") ||
    queryLower.includes("average resolution time") ||
    (queryLower.includes("time") && queryLower.includes("resolution"))
  ) {
    // Extract scope of MTTR calculation
    const mttrParams = { jqlQuery: "status = Resolved" }; // Default

    // Check if the request is for a specific ticket
    if (issueKeys.length > 0) {
      mttrParams.issueKey = issueKeys[0];
    }

    // Check if request is for a specific issue area/project
    // FIXED: Improved regex to avoid matching "for" in "for this week"
    const issueAreaMatch =
      queryLower.match(/issue area\s+(\w+)(?!\s+(for|this|in))/i) ||
      queryLower.match(/area\s+(\w+)(?!\s+(for|this|in))/i) ||
      queryLower.match(/project\s+(\w+)(?!\s+(for|this|in))/i);

    if (issueAreaMatch && issueAreaMatch[1]) {
      const projectKey =
        issueAreaMatch[1].toUpperCase() === "ZSEE" ? "ZSEE" : issueAreaMatch[1];
      mttrParams.jqlQuery = `project = "${projectKey}" AND status = Resolved`;
    }

    // Check if request is for a specific user
    const userMatch =
      queryLower.match(/user\s+(\w+)(?!\s+(for|this|in))/i) ||
      queryLower.match(/by\s+(\w+)(?!\s+(for|this|in))/i) ||
      queryLower.match(/for\s+(\w+)(?!\s+(this|week|month|year))/i);

    if (userMatch && userMatch[1]) {
      mttrParams.jqlQuery = `assignee = "${userMatch[1]}" AND status = Resolved`;
    }

    // Extract time range if specified (for "this week", etc.)
    const timeRangeMatch = queryLower.match(/this\s+(week|month|year)/i);
    if (timeRangeMatch && timeRangeMatch[1]) {
      const timeRange = timeRangeMatch[1].toLowerCase();
      if (timeRange === "week") {
        mttrParams.jqlQuery += " AND created >= startOfWeek()";
      } else if (timeRange === "month") {
        mttrParams.jqlQuery += " AND created >= startOfMonth()";
      } else if (timeRange === "year") {
        mttrParams.jqlQuery += " AND created >= startOfYear()";
      }
    }

    // If we need more parameters but don't have them, ask for clarification
    if (
      !mttrParams.issueKey &&
      mttrParams.jqlQuery === "status = Resolved" &&
      (queryLower.includes("this jira ticket") ||
        queryLower.includes("this issue area") ||
        queryLower.includes("this user"))
    ) {
      // Determine what's missing
      if (queryLower.includes("this jira ticket")) {
        return {
          analyticsType: "NEEDS_CLARIFICATION",
          missingInfo: "issue_key",
          prompt:
            "Which specific Jira ticket would you like to check the MTTR for?",
        };
      } else if (
        queryLower.includes("this issue area") ||
        queryLower.includes("this project")
      ) {
        return {
          analyticsType: "NEEDS_CLARIFICATION",
          missingInfo: "issue_area",
          prompt:
            "Which Issue Area or Project would you like to check the MTTR for?",
        };
      } else if (queryLower.includes("this user")) {
        return {
          analyticsType: "NEEDS_CLARIFICATION",
          missingInfo: "user_name",
          prompt: "Which user would you like to check the MTTR for?",
        };
      }
    }

    return {
      analyticsType: "MTTR_CALCULATION",
      parameters: mttrParams,
    };
  }

  // 3. Check for Top N issues query
  if (
    (queryLower.includes("top") || queryLower.includes("most")) &&
    (queryLower.includes("issue") || queryLower.includes("ticket"))
  ) {
    console.log("[advancedJiraQueryService] Detected TOP_N_ISSUES query type");

    // Extract N (defaults to 10)
    const nMatch = queryLower.match(/top\s+(\d+)/i);
    const n = nMatch ? parseInt(nMatch[1]) : 10;

    // Extract aggregation field (what to rank by)
    let aggregationField = "priority"; // Default to priority
    if (queryLower.includes("by assignee"))
      aggregationField = "assignee.displayName";
    if (queryLower.includes("by status")) aggregationField = "status.name";
    if (queryLower.includes("by priority")) aggregationField = "priority.name";
    if (queryLower.includes("by reporter"))
      aggregationField = "reporter.displayName";
    if (queryLower.includes("by component"))
      aggregationField = "components.name";

    // CRITICAL FIX: Detect "this Issue Area" FIRST before trying to extract project/area
    // Check if query includes "this Issue Area" or similar phrases
    if (
      queryLower.includes("this issue area") ||
      queryLower.includes("in this issue area") ||
      queryLower.includes("for this issue area") ||
      queryLower.includes("this project") ||
      (queryLower.includes("issue area") &&
        !queryLower.match(/issue area\s+\w+/i))
    ) {
      console.log(
        "[advancedJiraQueryService] Detected need for Issue Area clarification"
      );

      // Store context for follow-up handling
      saveQueryContextForFollowUp(chatHistory, {
        queryType: "TOP_N_ISSUES",
        n: n,
        aggregationField: aggregationField,
        timeFrame: extractTimeFrame(queryLower),
      });

      return {
        analyticsType: "NEEDS_CLARIFICATION",
        missingInfo: "issue_area",
        prompt:
          "Which Issue Area or Project would you like to check for top issues?",
      };
    }

    // Only try to extract project/area if we're not asking for clarification
    // FIXED: More precise regex to avoid matching "for this week"
    let jqlQueryFromUnderstanding = null;
    const projectMatch =
      queryLower.match(/\bproject\s+([a-z0-9]+)\b/i) ||
      queryLower.match(/\bin\s+([a-z0-9]+)\s+project\b/i);

    const issueAreaMatch =
      queryLower.match(/\bissue area\s+([a-z0-9]+)\b/i) ||
      queryLower.match(/\barea\s+([a-z0-9]+)\b/i);

    // Enhanced multi-word project name detection
    const multiWordProjectMatch = detectMultiWordProject(queryLower);

    if (multiWordProjectMatch) {
      jqlQueryFromUnderstanding = `project = "${multiWordProjectMatch}" ORDER BY created DESC`;
      console.log(
        `[advancedJiraQueryService] Extracted multi-word project: ${multiWordProjectMatch}`
      );
    } else if (
      projectMatch &&
      projectMatch[1] &&
      projectMatch[1] !== "for" &&
      projectMatch[1] !== "this"
    ) {
      const projectKey =
        projectMatch[1].toUpperCase() === "ZSEE" ? "ZSEE" : projectMatch[1];
      jqlQueryFromUnderstanding = `project = "${projectKey}" ORDER BY created DESC`;
      console.log(
        `[advancedJiraQueryService] Extracted project: ${projectKey}`
      );
    } else if (
      issueAreaMatch &&
      issueAreaMatch[1] &&
      issueAreaMatch[1] !== "for" &&
      issueAreaMatch[1] !== "this"
    ) {
      const projectKey =
        issueAreaMatch[1].toUpperCase() === "ZSEE" ? "ZSEE" : issueAreaMatch[1];
      jqlQueryFromUnderstanding = `project = "${projectKey}" ORDER BY created DESC`;
      console.log(
        `[advancedJiraQueryService] Extracted issue area: ${projectKey}`
      );
    } else {
      // Default to ZSEE if no specific project is mentioned
      jqlQueryFromUnderstanding = 'project = "ZSEE" ORDER BY created DESC';
      console.log(
        "[advancedJiraQueryService] No project specified, defaulting to ZSEE"
      );
    }

    // Extract time range if specified (for "this week", etc.)
    const timeRange = extractTimeFrame(queryLower);
    let timeRangeJql = "";

    if (timeRange) {
      if (timeRange === "week") {
        timeRangeJql = " AND created >= startOfWeek()";
      } else if (timeRange === "month") {
        timeRangeJql = " AND created >= startOfMonth()";
      } else if (timeRange === "year") {
        timeRangeJql = " AND created >= startOfYear()";
      }
      console.log(
        `[advancedJiraQueryService] Extracted time range: ${timeRange}`
      );
    }

    // Add time range to JQL if present
    if (jqlQueryFromUnderstanding && timeRangeJql) {
      jqlQueryFromUnderstanding = jqlQueryFromUnderstanding.replace(
        " ORDER BY",
        timeRangeJql + " ORDER BY"
      );
    }

    return {
      analyticsType: "TOP_N_ISSUES",
      parameters: {
        N: n,
        aggregationField: aggregationField,
        jqlQueryFromUnderstanding: jqlQueryFromUnderstanding,
        timeRange: timeRange,
      },
    };
  }

  // 4. Check for Bug List / Generation Analysis
  if (
    queryLower.includes("bug") &&
    (queryLower.includes("list") ||
      queryLower.includes("reported") ||
      queryLower.includes("related"))
  ) {
    // Extract source type (issue or version/release)
    let sourceType = "version"; // Default to version search
    let sourceIssueKey = null;
    let productName = null;
    let versionName = null;

    // Check if specific ticket mentioned
    if (issueKeys.length > 0) {
      sourceType = "issue";
      sourceIssueKey = issueKeys[0];
    }

    // Extract product/client and version
    // FIXED: Improved regex to avoid issues with "for this week"
    const clientMatch =
      queryLower.match(/client\s+(\w+)(?!\s+(for|this|in))/i) ||
      queryLower.match(/for\s+(\w+)\s+client(?!\s+(this|week|month|year))/i);

    const versionMatch =
      queryLower.match(/version\s+(\w+)(?!\s+(for|this|in))/i) ||
      queryLower.match(/release\s+(\w+)(?!\s+(for|this|in))/i) ||
      queryLower.match(/(\w+)\s+release(?!\s+(for|this|in))/i);

    if (clientMatch && clientMatch[1]) {
      productName =
        clientMatch[1].toUpperCase() === "ZSEE" ? "ZSEE" : clientMatch[1];
    }

    if (versionMatch && versionMatch[1]) {
      versionName = versionMatch[1];
    }

    // Extract time range
    const timeRange = extractTimeFrame(queryLower);

    // If we need more parameters but don't have them, ask for clarification
    if (
      sourceType === "version" &&
      (!productName || !versionName) &&
      (queryLower.includes("this client") ||
        queryLower.includes("this release"))
    ) {
      if (!productName && queryLower.includes("this client")) {
        // Store context for follow-up handling
        saveQueryContextForFollowUp(chatHistory, {
          queryType: "BUG_GENERATION_ANALYSIS",
          sourceType: "version",
          versionName: versionName,
          timeRange: timeRange,
        });

        return {
          analyticsType: "NEEDS_CLARIFICATION",
          missingInfo: "client_name",
          prompt: "Which client would you like to check for bugs?",
        };
      } else if (!versionName && queryLower.includes("this release")) {
        // Store context for follow-up handling
        saveQueryContextForFollowUp(chatHistory, {
          queryType: "BUG_GENERATION_ANALYSIS",
          sourceType: "version",
          productName: productName,
          timeRange: timeRange,
        });

        return {
          analyticsType: "NEEDS_CLARIFICATION",
          missingInfo: "release_version",
          prompt: "Which release or version would you like to check for bugs?",
        };
      }
    }

    // Default to ZSEE if no product name specified
    if (!productName && sourceType === "version") {
      productName = "ZSEE";
      console.log(
        "[advancedJiraQueryService] No client/product specified, defaulting to ZSEE"
      );
    }

    return {
      analyticsType: "BUG_GENERATION_ANALYSIS",
      parameters: {
        sourceType: sourceType,
        sourceIssueKey: sourceIssueKey,
        productName: productName,
        versionName: versionName,
        timeRange: timeRange,
      },
    };
  }

  // 5. Check for chart/data visualization request
  if (
    queryLower.includes("chart") ||
    queryLower.includes("graph") ||
    queryLower.includes("table") ||
    queryLower.includes("pie") ||
    queryLower.includes("visualize") ||
    queryLower.includes("generate") ||
    queryLower.includes("create") ||
    queryLower.includes("summarize")
  ) {
    // Determine visualization type
    let visualizationType = "pie_chart"; // Default
    if (queryLower.includes("pie")) visualizationType = "pie_chart";
    if (queryLower.includes("bar")) visualizationType = "bar_chart";
    if (queryLower.includes("table")) visualizationType = "table";

    // Extract fields to group by and analyze
    let groupByField = "status"; // Default
    if (queryLower.includes("by status")) groupByField = "status.name";
    if (queryLower.includes("by assignee"))
      groupByField = "assignee.displayName";
    if (queryLower.includes("by priority")) groupByField = "priority.name";
    if (queryLower.includes("by component")) groupByField = "components.name";

    // Extract project scope
    // FIXED: Improved regex to avoid matching "for" in "for this week"
    let project = null;
    const projectMatch =
      queryLower.match(/\bproject\s+([a-z0-9]+)\b/i) ||
      queryLower.match(/\bin\s+([a-z0-9]+)\s+project\b/i);

    // Enhanced multi-word project name detection
    const multiWordProjectMatch = detectMultiWordProject(queryLower);

    if (multiWordProjectMatch) {
      project = multiWordProjectMatch;
    } else if (
      projectMatch &&
      projectMatch[1] &&
      projectMatch[1] !== "for" &&
      projectMatch[1] !== "this"
    ) {
      project =
        projectMatch[1].toUpperCase() === "ZSEE" ? "ZSEE" : projectMatch[1];
    } else {
      // Default to ZSEE if no project specified
      project = "ZSEE";
      console.log(
        "[advancedJiraQueryService] No project specified for visualization, defaulting to ZSEE"
      );
    }

    // Extract JQL if present
    let jqlQuery = null;
    if (queryLower.includes("for this jira query")) {
      // Use chat history to find the most recent JQL query
      // For now, we'll use a simplified approach - in a full implementation,
      // you would parse chat history to find the most recent JQL
      jqlQuery = "project = ZSEE AND status != Closed ORDER BY created DESC";
    } else {
      // Create a basic JQL with the project
      jqlQuery = `project = "${project}"`;
    }

    // Extract time range if specified (for "this week", etc.)
    const timeRange = extractTimeFrame(queryLower);
    if (timeRange) {
      if (timeRange === "week") {
        jqlQuery += " AND created >= startOfWeek()";
      } else if (timeRange === "month") {
        jqlQuery += " AND created >= startOfMonth()";
      } else if (timeRange === "year") {
        jqlQuery += " AND created >= startOfYear()";
      }
    }

    // If we need more parameters but don't have them, ask for clarification
    if (queryLower.includes("this project") && !project) {
      return {
        analyticsType: "NEEDS_CLARIFICATION",
        missingInfo: "project_name",
        prompt: "Which project would you like to visualize data for?",
      };
    }

    return {
      analyticsType: "DATA_FOR_CHART_OR_TABLE",
      parameters: {
        visualizationType: visualizationType,
        groupByField: groupByField,
        project: project,
        jqlQuery: jqlQuery,
      },
    };
  }

  // 6. Default: Use JQL generation for general search
  return {
    analyticsType: "GENERAL_JQL_QUERY",
    parameters: { naturalLanguageQuery },
  };
}

/**
 * Check for responses to previous clarification requests
 *
 * @param {string} query - The current query
 * @param {Array} chatHistory - The conversation history
 * @returns {object|null} - Clarification response object if found, null otherwise
 */
function checkForClarificationResponse(query, chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length < 2) {
    return null;
  }

  // Find the last assistant message
  let lastAssistantIndex = -1;
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "assistant") {
      lastAssistantIndex = i;
      break;
    }
  }

  if (lastAssistantIndex === -1) return null;

  const lastAssistantMessage = chatHistory[lastAssistantIndex].message;
  const isSimpleResponse = query.trim().split(/\s+/).length <= 3;

  // Check if last message was a clarification request
  if (
    lastAssistantMessage.includes("Which Issue Area") ||
    lastAssistantMessage.includes("Which project would you like")
  ) {
    // This appears to be a response to an Issue Area clarification
    console.log(
      "[advancedJiraQueryService] Detected response to Issue Area clarification"
    );

    // Try to find stored context
    const storedContext = getStoredQueryContext(chatHistory);
    if (storedContext && storedContext.queryType === "TOP_N_ISSUES") {
      // This is a follow-up for TOP_N_ISSUES
      const projectName = query.trim();
      const projectKey =
        projectName.toUpperCase() === "ZSEE" ? "ZSEE" : projectName;

      let jqlQuery = `project = "${projectKey}" ORDER BY created DESC`;

      // Add time frame if it was in the original query
      if (storedContext.timeFrame) {
        if (storedContext.timeFrame === "week") {
          jqlQuery = jqlQuery.replace(
            " ORDER BY",
            " AND created >= startOfWeek() ORDER BY"
          );
        } else if (storedContext.timeFrame === "month") {
          jqlQuery = jqlQuery.replace(
            " ORDER BY",
            " AND created >= startOfMonth() ORDER BY"
          );
        } else if (storedContext.timeFrame === "year") {
          jqlQuery = jqlQuery.replace(
            " ORDER BY",
            " AND created >= startOfYear() ORDER BY"
          );
        }
      }

      return {
        analyticsType: "TOP_N_ISSUES",
        parameters: {
          N: storedContext.n || 10,
          aggregationField: storedContext.aggregationField || "priority.name",
          jqlQueryFromUnderstanding: jqlQuery,
          isFollowUpResponse: true,
          originalProject: projectName,
        },
      };
    }

    // Generic fallback if we don't have stored context
    if (isSimpleResponse) {
      const projectName = query.trim();
      const projectKey =
        projectName.toUpperCase() === "ZSEE" ? "ZSEE" : projectName;

      return {
        analyticsType: "TOP_N_ISSUES",
        parameters: {
          N: 10,
          aggregationField: "priority.name",
          jqlQueryFromUnderstanding: `project = "${projectKey}" ORDER BY created DESC`,
          isFollowUpResponse: true,
          originalProject: projectName,
        },
      };
    }
  } else if (lastAssistantMessage.includes("Which specific Jira ticket")) {
    // This appears to be a response to a Jira ticket clarification
    console.log(
      "[advancedJiraQueryService] Detected response to Jira ticket clarification"
    );

    // Check if it looks like a ticket ID
    const ticketIdMatch = query.match(/([A-Z]+-\d+)/);
    if (ticketIdMatch) {
      const ticketId = ticketIdMatch[0];

      // Check the stored context to determine the right analytics type
      const storedContext = getStoredQueryContext(chatHistory);
      if (storedContext && storedContext.queryType === "MTTR_CALCULATION") {
        return {
          analyticsType: "MTTR_CALCULATION",
          parameters: {
            issueKey: ticketId,
            isFollowUpResponse: true,
          },
        };
      } else if (
        storedContext &&
        storedContext.queryType === "SENTIMENT_ANALYSIS"
      ) {
        return {
          analyticsType: "SENTIMENT_ANALYSIS",
          parameters: {
            issueKey: ticketId,
            isFollowUpResponse: true,
          },
        };
      }

      // Default to ticket summary if we don't have specific context
      return {
        analyticsType: "TICKET_SUMMARY",
        parameters: {
          issueKey: ticketId,
          isFollowUpResponse: true,
        },
      };
    }
  } else if (lastAssistantMessage.includes("Which client would you like")) {
    // Response to client name clarification for bug analysis
    console.log(
      "[advancedJiraQueryService] Detected response to client clarification"
    );

    if (isSimpleResponse) {
      const storedContext = getStoredQueryContext(chatHistory);
      const clientName = query.trim();

      if (
        storedContext &&
        storedContext.queryType === "BUG_GENERATION_ANALYSIS"
      ) {
        return {
          analyticsType: "BUG_GENERATION_ANALYSIS",
          parameters: {
            sourceType: storedContext.sourceType || "version",
            productName: clientName,
            versionName: storedContext.versionName,
            timeRange: storedContext.timeRange,
            isFollowUpResponse: true,
          },
        };
      }

      // Generic fallback
      return {
        analyticsType: "BUG_GENERATION_ANALYSIS",
        parameters: {
          sourceType: "version",
          productName: clientName,
          isFollowUpResponse: true,
        },
      };
    }
  } else if (lastAssistantMessage.includes("Which release or version")) {
    // Response to version clarification for bug analysis
    console.log(
      "[advancedJiraQueryService] Detected response to version clarification"
    );

    if (isSimpleResponse) {
      const storedContext = getStoredQueryContext(chatHistory);
      const versionName = query.trim();

      if (
        storedContext &&
        storedContext.queryType === "BUG_GENERATION_ANALYSIS"
      ) {
        return {
          analyticsType: "BUG_GENERATION_ANALYSIS",
          parameters: {
            sourceType: storedContext.sourceType || "version",
            productName: storedContext.productName || "ZSEE",
            versionName: versionName,
            timeRange: storedContext.timeRange,
            isFollowUpResponse: true,
          },
        };
      }

      // Generic fallback
      return {
        analyticsType: "BUG_GENERATION_ANALYSIS",
        parameters: {
          sourceType: "version",
          productName: "ZSEE",
          versionName: versionName,
          isFollowUpResponse: true,
        },
      };
    }
  } else if (lastAssistantMessage.includes("Which user would you like")) {
    // Response to user clarification for MTTR
    console.log(
      "[advancedJiraQueryService] Detected response to user clarification"
    );

    if (isSimpleResponse) {
      const userName = query.trim();

      return {
        analyticsType: "MTTR_CALCULATION",
        parameters: {
          jqlQuery: `assignee = "${userName}" AND status = Resolved`,
          isFollowUpResponse: true,
        },
      };
    }
  }

  return null;
}

/**
 * Stores query context in chat history for follow-up handling
 *
 * @param {Array} chatHistory - The conversation history array
 * @param {object} contextData - The context data to store
 */
function saveQueryContextForFollowUp(chatHistory, contextData) {
  if (!chatHistory || !Array.isArray(chatHistory)) return;

  // Add a metadata entry that won't be displayed but can be retrieved later
  chatHistory.push({
    role: "_metadata",
    message: JSON.stringify({
      queryContext: contextData,
      timestamp: new Date().toISOString(),
    }),
  });

  console.log(
    "[advancedJiraQueryService] Stored query context for follow-up:",
    contextData
  );
}

/**
 * Gets stored query context from chat history
 *
 * @param {Array} chatHistory - The conversation history array
 * @returns {object|null} - The stored context or null if not found
 */
function getStoredQueryContext(chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory)) return null;

  // Look for the most recent metadata entry
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "_metadata") {
      try {
        const data = JSON.parse(chatHistory[i].message);
        if (data.queryContext) {
          return data.queryContext;
        }
      } catch (e) {
        console.warn(
          "[advancedJiraQueryService] Error parsing stored context:",
          e
        );
      }
    }
  }

  return null;
}

/**
 * Extracts time frame (week/month/year) from query
 *
 * @param {string} queryLower - Lowercase query text
 * @returns {string|null} - The time frame or null if not found
 */
function extractTimeFrame(queryLower) {
  const timeRangeMatch = queryLower.match(/this\s+(week|month|year)/i);
  return timeRangeMatch ? timeRangeMatch[1].toLowerCase() : null;
}

/**
 * Detect multi-word project names in the query
 *
 * @param {string} queryLower - Lowercase query text
 * @returns {string|null} - The detected project name or null if not found
 */
function detectMultiWordProject(queryLower) {
  for (const projectName of knownProjectNames) {
    if (queryLower.includes(projectName)) {
      // Make sure it's not part of a larger word
      const pattern = new RegExp(`\\b${projectName}\\b`, "i");
      if (pattern.test(queryLower)) {
        return projectName.charAt(0).toUpperCase() + projectName.slice(1);
      }
    }
  }
  return null;
}

/**
 * Helper function to check if a query is about AI summary language issues
 *
 * @param {string} queryLower - The lowercase query to check
 * @returns {boolean} - True if the query is about AI summary language
 */
function isAiSummaryLanguageQuery(queryLower) {
  // Count how many AI summary language terms are in the query
  let matchCount = 0;

  const aiSummaryTerms = [
    "ai summary",
    "meeting summary",
    "incorrect language",
    "wrong language",
    "language spoken",
    "spoken language",
    "transcription language",
    "language detection",
    "language issue",
    "translation",
    "transcript",
  ];

  for (const term of aiSummaryTerms) {
    if (queryLower.includes(term)) {
      matchCount++;
    }
  }

  // Either multiple terms or specific combinations
  if (matchCount >= 2) return true;

  // Check for specific combinations that strongly indicate this query type
  if (
    (queryLower.includes("ai summary") && queryLower.includes("language")) ||
    (queryLower.includes("meeting") &&
      queryLower.includes("language") &&
      queryLower.includes("incorrect")) ||
    (queryLower.includes("transcript") &&
      queryLower.includes("language") &&
      queryLower.includes("wrong"))
  ) {
    return true;
  }

  return false;
}

/**
 * Builds JQL query optimized for AI summary language issues
 *
 * @returns {string} - JQL query for AI summary language issues
 */
function buildAiSummaryJqlQuery() {
  return (
    '(summary ~ "AI summary" OR summary ~ "meeting summary" OR summary ~ "language") AND ' +
    '(summary ~ "incorrect" OR summary ~ "wrong" OR summary ~ "not working" OR ' +
    'description ~ "incorrect language" OR description ~ "wrong language" OR ' +
    'description ~ "AI summary") ORDER BY updatedDate DESC'
  );
}

/**
 * Gets a comprehensive summary of a Jira ticket with all relevant details.
 *
 * @param {string} issueKey - The Jira issue key (e.g., ZSEE-12345)
 * @returns {Promise<object>} - A promise resolving to the ticket summary.
 */
async function getTicketSummary(issueKey) {
  console.log(
    `[advancedJiraQueryService] Getting summary for ticket: ${issueKey}`
  );
  try {
    // Expand to get more details like comments, attachments, links as per design
    const issue = await jiraClient.getIssue(issueKey, {
      expand:
        "changelog,renderedFields,names,schema,operations,editmeta,changelog,versionedRepresentations,issuelinks,comments,attachments",
    });
    if (!issue) {
      return { success: false, error: `Ticket ${issueKey} not found.` };
    }
    // Basic summary, can be enhanced with LLM for conciseness if needed
    const summary = {
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
      assignee: issue.fields.assignee
        ? issue.fields.assignee.displayName
        : "Unassigned",
      reporter: issue.fields.reporter
        ? issue.fields.reporter.displayName
        : "N/A",
      created: issue.fields.created,
      updated: issue.fields.updated,
      description: issue.fields.description, // Or renderedFields.description
      priority: issue.fields.priority ? issue.fields.priority.name : "N/A",
      resolution: issue.fields.resolution
        ? issue.fields.resolution.name
        : "N/A",
      comments: issue.fields.comment
        ? issue.fields.comment.comments
            .map((c) => ({
              author: c.author.displayName,
              created: c.created,
              body: c.body,
            }))
            .slice(0, 5)
        : [], // Example: first 5 comments
      attachments: issue.fields.attachment
        ? issue.fields.attachment
            .map((a) => ({
              filename: a.filename,
              size: a.size,
              author: a.author.displayName,
              created: a.created,
            }))
            .slice(0, 5)
        : [],
      linkedIssues: issue.fields.issuelinks
        ? issue.fields.issuelinks.map((link) => {
            const direction = link.inwardIssue ? "inward" : "outward";
            const linkedIssue = link.inwardIssue || link.outwardIssue;
            return {
              type: link.type.name,
              direction,
              key: linkedIssue.key,
              summary: linkedIssue.fields.summary,
              status: linkedIssue.fields.status.name,
            };
          })
        : [],
    };
    return { success: true, data: summary, presentationHint: "ticket_summary" };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error fetching ticket ${issueKey}:`,
      error
    );
    return { success: false, error: error.message };
  }
}

/**
 * Calculates Mean Time To Resolution (MTTR) for Jira tickets.
 *
 * @param {object} params - Parameters including JQL query or issue key.
 * @returns {Promise<object>} - A promise resolving to MTTR calculation results.
 */
async function getMTTR(params) {
  // Params: { jqlQuery, project, issueType, priority, dateRange, issueKey }
  console.log(
    `[advancedJiraQueryService] Calculating MTTR with params:`,
    params
  );
  let issues = [];
  try {
    if (params.issueKey) {
      const issue = await jiraClient.getIssue(params.issueKey, {
        fields: "created,resolutiondate,status,updated",
      });
      if (issue) issues.push(issue);
    } else if (params.jqlQuery) {
      // Ensure JQL targets resolved issues and includes necessary fields
      const jql = `${params.jqlQuery} AND statusCategory = Done`; // Assuming statusCategory Done implies resolved
      const searchResults = await jiraClient.searchIssues({
        jql,
        fields: ["created", "resolutiondate", "status", "updated"],
        maxResults: 250,
      }); // Limit for now
      issues = searchResults.issues || [];
    } else {
      return {
        success: false,
        error: "MTTR calculation requires an issue key or JQL query.",
      };
    }

    if (issues.length === 0) {
      return {
        success: true,
        data: {
          mttrFormatted: "N/A",
          count: 0,
          message: "No resolved issues found for the given criteria.",
        },
        presentationHint: "mttr_result",
      };
    }

    const mttrData = calculateMTTR(issues);
    return { success: true, data: mttrData, presentationHint: "mttr_result" };
  } catch (error) {
    console.error(`[advancedJiraQueryService] Error calculating MTTR:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets the top N issues based on specified criteria.
 *
 * @param {object} params - Parameters including N, aggregation field, and filters.
 * @returns {Promise<object>} - A promise resolving to top N issues.
 */
async function getTopNIssues(params) {
  // Params: { N, entityType, aggregationField, project, issueArea, componentName, dateRange, otherJqlCriteria }
  console.log(
    `[advancedJiraQueryService] Getting Top N issues with params:`,
    params
  );
  try {
    // FIXED: Improved JQL construction
    let jql = "";

    // Use jqlQueryFromUnderstanding if available
    if (params.jqlQueryFromUnderstanding) {
      jql = params.jqlQueryFromUnderstanding;
    }
    // Otherwise build from other criteria
    else if (params.otherJqlCriteria) {
      jql = params.otherJqlCriteria;
    } else if (params.project) {
      jql = `project = "${params.project}"`;
    } else {
      // Default JQL if nothing else provided - use ZSEE
      jql = "project = ZSEE ORDER BY created DESC";
    }

    // Make sure JQL ends with ORDER BY
    if (!jql.includes("ORDER BY")) {
      jql += " ORDER BY created DESC";
    }

    // Add time range if specified but not already included
    if (params.timeRange && !jql.includes("startOf")) {
      if (params.timeRange === "week" && !jql.includes("startOfWeek")) {
        jql = jql.replace(
          " ORDER BY",
          " AND created >= startOfWeek() ORDER BY"
        );
      } else if (
        params.timeRange === "month" &&
        !jql.includes("startOfMonth")
      ) {
        jql = jql.replace(
          " ORDER BY",
          " AND created >= startOfMonth() ORDER BY"
        );
      } else if (params.timeRange === "year" && !jql.includes("startOfYear")) {
        jql = jql.replace(
          " ORDER BY",
          " AND created >= startOfYear() ORDER BY"
        );
      }
    }

    // Determine fields to fetch
    const fieldsToFetch = [
      "summary",
      "status",
      "assignee",
      "priority",
      "created",
      "updated",
    ];

    // Add aggregation field if it's not already in the list
    if (
      params.aggregationField &&
      !fieldsToFetch.includes(params.aggregationField)
    ) {
      fieldsToFetch.push(params.aggregationField);
    }

    // Make sure key is included
    if (!fieldsToFetch.includes("key")) {
      fieldsToFetch.push("key");
    }

    // Clean up field names for Jira API
    const processedFields = fieldsToFetch.map((field) => {
      // Remove fields. prefix if present
      return field.startsWith("fields.") ? field.substring(7) : field;
    });

    console.log(`[advancedJiraQueryService] Using JQL: ${jql}`);
    console.log(
      `[advancedJiraQueryService] Fetching fields: ${processedFields.join(
        ", "
      )}`
    );

    // Call jiraClient with object parameter
    const searchResults = await jiraClient.searchIssues({
      jql: jql,
      fields: processedFields,
      maxResults: 250,
    });

    // Extract issues from search results
    const issues =
      searchResults && Array.isArray(searchResults)
        ? searchResults
        : searchResults?.issues || [];

    if (issues.length === 0) {
      return {
        success: true,
        data: [],
        message: "No issues found for the given criteria.",
        presentationHint: "list_result",
      };
    }

    // Process according to aggregation field
    let fieldPath = params.aggregationField;
    if (!fieldPath.startsWith("fields.")) {
      fieldPath = `fields.${params.aggregationField}`;
    }

    const groupedData = groupAndCount(issues, fieldPath);
    const topN = groupedData.slice(0, params.N || 10);

    // Add contextual information for clearer presentation
    const contextInfo = {
      projectName: params.originalProject || extractProjectFromJql(jql),
      timeFrame: params.timeRange || extractTimeFrameFromJql(jql),
      totalIssuesFound: issues.length,
    };

    return {
      success: true,
      data: topN,
      presentationHint: "top_n_list",
      N: params.N || 10,
      aggregatedBy: params.aggregationField,
      contextInfo: contextInfo,
    };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error getting Top N issues:`,
      error
    );
    return { success: false, error: error.message };
  }
}

/**
 * Extract project name from JQL query
 *
 * @param {string} jql - JQL query string
 * @returns {string} - Extracted project name or "ZSEE" if not found
 */
function extractProjectFromJql(jql) {
  const projectMatch = jql.match(/project\s*=\s*"([^"]+)"/i);
  return projectMatch ? projectMatch[1] : "ZSEE";
}

/**
 * Extract time frame from JQL query
 *
 * @param {string} jql - JQL query string
 * @returns {string|null} - Extracted time frame or null if not found
 */
function extractTimeFrameFromJql(jql) {
  if (jql.includes("startOfWeek()")) return "week";
  if (jql.includes("startOfMonth()")) return "month";
  if (jql.includes("startOfYear()")) return "year";
  return null;
}

/**
 * Analyzes bugs generated from a source feature or version.
 *
 * @param {object} params - Parameters including source type and identifiers.
 * @returns {Promise<object>} - A promise resolving to bug generation analysis.
 */
async function getBugGenerationAnalysis(params) {
  // Params: { sourceType ("issue" | "version"), sourceIssueKey, productName, versionName, linkType }
  console.log(
    `[advancedJiraQueryService] Analyzing bug generation with params:`,
    params
  );
  let sourceIssues = [];
  try {
    if (params.sourceType === "issue" && params.sourceIssueKey) {
      const issue = await jiraClient.getIssue(params.sourceIssueKey, {
        expand: "issuelinks",
      });
      if (issue) sourceIssues.push(issue);
    } else if (
      params.sourceType === "version" &&
      params.productName &&
      params.versionName
    ) {
      // This requires mapping productName to Jira project and then searching by fixVersion
      // Simplified: Assume productName is project key for now
      let jql = `project = "${params.productName}" AND fixVersion = "${params.versionName}" AND issuetype = Feature`; // Example: find features in version

      // Add time restriction if provided
      if (params.timeRange) {
        if (params.timeRange === "week") {
          jql += " AND created >= startOfWeek()";
        } else if (params.timeRange === "month") {
          jql += " AND created >= startOfMonth()";
        } else if (params.timeRange === "year") {
          jql += " AND created >= startOfYear()";
        }
      }

      const searchResults = await jiraClient.searchIssues({
        jql,
        expand: "issuelinks",
        maxResults: 50,
      });
      sourceIssues = searchResults.issues || [];
    } else {
      return {
        success: false,
        error:
          "Bug generation analysis requires a source issue or product/version.",
      };
    }

    if (sourceIssues.length === 0) {
      return {
        success: true,
        data: [],
        message: "No source issues found for bug generation analysis.",
        presentationHint: "list_result",
      };
    }

    let allLinkedBugs = [];
    for (const sourceIssue of sourceIssues) {
      const linkedBugs = analyzeLinkedIssues(
        sourceIssue,
        "Bug",
        params.linkType ? [params.linkType] : []
      );
      allLinkedBugs.push(
        ...linkedBugs.map((b) => ({ ...b, source: sourceIssue.key }))
      );
    }

    // Deduplicate if multiple source issues link to the same bug
    const uniqueBugs = Array.from(
      new Map(allLinkedBugs.map((bug) => [bug.key, bug])).values()
    );

    return {
      success: true,
      data: uniqueBugs,
      presentationHint: "bug_list_result",
      contextInfo: {
        productName: params.productName,
        versionName: params.versionName,
        totalBugsFound: uniqueBugs.length,
      },
    };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error analyzing bug generation:`,
      error
    );
    return { success: false, error: error.message };
  }
}

/**
 * Gets data for chart or table visualization.
 *
 * @param {object} params - Parameters including visualization type and data filters.
 * @returns {Promise<object>} - A promise resolving to data formatted for visualization.
 */
async function getDataForChartOrTable(params) {
  // Params: { visualizationType ("pie_chart" | "bar_chart" | "table"), jqlQuery, project, groupByField, valueField, tableFields, dateRange }
  console.log(
    `[advancedJiraQueryService] Getting data for chart/table with params:`,
    params
  );
  try {
    let jql = params.jqlQuery;
    if (!jql) {
      // Attempt to build JQL if not fully provided
      jql = params.project ? `project = "${params.project}"` : "";

      // Add time restriction if applicable
      if (params.dateRange) {
        const today = new Date();
        if (params.dateRange === "week") {
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay()); // Sunday of this week
          jql += ` AND created >= "${weekStart.toISOString().split("T")[0]}"`;
        } else if (params.dateRange === "month") {
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          jql += ` AND created >= "${monthStart.toISOString().split("T")[0]}"`;
        } else if (params.dateRange === "year") {
          const yearStart = new Date(today.getFullYear(), 0, 1);
          jql += ` AND created >= "${yearStart.toISOString().split("T")[0]}"`;
        }
      }

      if (!jql) {
        // Default to ZSEE if nothing specified
        jql = "project = ZSEE";
      }
    }

    const fieldsToFetch = new Set(["key"]);
    if (params.groupByField)
      fieldsToFetch.add(
        params.groupByField.startsWith("fields.")
          ? params.groupByField.substring(7)
          : params.groupByField
      );
    if (params.valueField)
      fieldsToFetch.add(
        params.valueField.startsWith("fields.")
          ? params.valueField.substring(7)
          : params.valueField
      );
    if (params.tableFields && Array.isArray(params.tableFields)) {
      params.tableFields.forEach((f) =>
        fieldsToFetch.add(f.startsWith("fields.") ? f.substring(7) : f)
      );
    }

    const searchResults = await jiraClient.searchIssues({
      jql,
      fields: Array.from(fieldsToFetch),
      maxResults: 500,
    });

    const issues = Array.isArray(searchResults)
      ? searchResults
      : searchResults?.issues || [];

    if (issues.length === 0) {
      return {
        success: true,
        data: [],
        message: "No issues found for the given JQL.",
        presentationHint: params.visualizationType,
      };
    }

    let chartData;
    if (params.visualizationType === "table") {
      chartData = formatDataForTable(
        issues,
        params.tableFields || ["key", "fields.summary", "fields.status.name"]
      );
    } else if (
      params.visualizationType === "pie_chart" ||
      params.visualizationType === "bar_chart"
    ) {
      if (!params.groupByField)
        return {
          success: false,
          error: "groupByField is required for charts.",
        };
      chartData = groupAndCount(
        issues,
        `fields.${params.groupByField}`,
        params.valueField ? `fields.${params.valueField}` : null
      );
    } else {
      return {
        success: false,
        error: `Unsupported visualization type: ${params.visualizationType}`,
      };
    }

    return {
      success: true,
      data: chartData,
      presentationHint: params.visualizationType,
      query: jql,
      contextInfo: {
        projectName: params.project || extractProjectFromJql(jql),
        totalIssuesAnalyzed: issues.length,
        visualizationType: params.visualizationType,
        groupedBy: params.groupByField,
      },
    };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error getting data for chart/table:`,
      error
    );
    return { success: false, error: error.message };
  }
}

/**
 * Performs sentiment analysis on a Jira ticket.
 *
 * @param {object} params - Parameters including issue key.
 * @returns {Promise<object>} - A promise resolving to sentiment analysis results.
 */
async function getSentimentAnalysis(params) {
  // Params: { issueKey }
  console.log(
    `[advancedJiraQueryService] Analyzing sentiment for ticket: ${params.issueKey}`
  );
  try {
    // Get issue with comments and description
    const issue = await jiraClient.getIssue(params.issueKey, {
      expand: "comments",
      fields: ["summary", "description", "comment", "status", "assignee"],
    });

    if (!issue) {
      return { success: false, error: `Ticket ${params.issueKey} not found.` };
    }

    // Collect text content from the ticket
    const textFields = [];

    // Add summary
    if (issue.fields?.summary) {
      textFields.push(issue.fields.summary);
    }

    // Add description
    if (issue.fields?.description?.content) {
      const description = issue.fields.description.content
        .map((c) => c.content?.map((t) => t.text).join(" ") || "")
        .join("\n");
      if (description) textFields.push(description);
    }

    // Add comments
    const comments = [];
    if (issue.fields?.comment?.comments) {
      issue.fields.comment.comments.forEach((comment) => {
        if (comment.body?.content) {
          const commentText = comment.body.content
            .map((c) => c.content?.map((t) => t.text).join(" ") || "")
            .join("\n");
          if (commentText) {
            comments.push({
              author: comment.author?.displayName || "Unknown",
              created: comment.created,
              text: commentText,
            });
            textFields.push(commentText);
          }
        }
      });
    }

    // Perform basic sentiment analysis
    let positiveCount = 0;
    let negativeCount = 0;
    const allText = textFields.join(" ").toLowerCase();

    // Count positive and negative terms
    sentimentScores.positive.forEach((term) => {
      const matches = allText.match(new RegExp(`\\b${term}\\b`, "gi"));
      if (matches) positiveCount += matches.length;
    });

    sentimentScores.negative.forEach((term) => {
      const matches = allText.match(new RegExp(`\\b${term}\\b`, "gi"));
      if (matches) negativeCount += matches.length;
    });

    // Calculate sentiment scores
    const totalSentimentTerms = positiveCount + negativeCount;
    const sentimentScore =
      totalSentimentTerms > 0
        ? (positiveCount - negativeCount) / totalSentimentTerms
        : 0;

    // Determine overall sentiment
    let overallSentiment;
    if (sentimentScore > 0.2) {
      overallSentiment = "Positive";
    } else if (sentimentScore < -0.2) {
      overallSentiment = "Negative";
    } else {
      overallSentiment = "Neutral";
    }

    // Analyze sentiment in comments over time
    const commentSentiments = comments.map((comment) => {
      let commentPositive = 0;
      let commentNegative = 0;
      const text = comment.text.toLowerCase();

      sentimentScores.positive.forEach((term) => {
        const matches = text.match(new RegExp(`\\b${term}\\b`, "gi"));
        if (matches) commentPositive += matches.length;
      });

      sentimentScores.negative.forEach((term) => {
        const matches = text.match(new RegExp(`\\b${term}\\b`, "gi"));
        if (matches) commentNegative += matches.length;
      });

      const total = commentPositive + commentNegative;
      const score = total > 0 ? (commentPositive - commentNegative) / total : 0;

      let sentiment;
      if (score > 0.2) sentiment = "Positive";
      else if (score < -0.2) sentiment = "Negative";
      else sentiment = "Neutral";

      return {
        author: comment.author,
        created: comment.created,
        sentiment,
        score,
      };
    });

    // Extract noteworthy terms
    const noteworthyTerms = {
      positive: [],
      negative: [],
    };

    sentimentScores.positive.forEach((term) => {
      const matches = allText.match(new RegExp(`\\b${term}\\b`, "gi"));
      if (matches && matches.length > 1) {
        noteworthyTerms.positive.push({ term, count: matches.length });
      }
    });

    sentimentScores.negative.forEach((term) => {
      const matches = allText.match(new RegExp(`\\b${term}\\b`, "gi"));
      if (matches && matches.length > 1) {
        noteworthyTerms.negative.push({ term, count: matches.length });
      }
    });

    // Sort by count
    noteworthyTerms.positive.sort((a, b) => b.count - a.count);
    noteworthyTerms.negative.sort((a, b) => b.count - a.count);

    // Take top 5
    noteworthyTerms.positive = noteworthyTerms.positive.slice(0, 5);
    noteworthyTerms.negative = noteworthyTerms.negative.slice(0, 5);

    // Prepare results
    const sentimentResults = {
      ticketKey: params.issueKey,
      summary: issue.fields?.summary,
      status: issue.fields?.status?.name || "Unknown",
      assignee: issue.fields?.assignee?.displayName || "Unassigned",
      overallSentiment,
      sentimentScore: sentimentScore.toFixed(2),
      positiveTerms: positiveCount,
      negativeTerms: negativeCount,
      commentSentiments,
      noteworthyTerms,
      totalComments: comments.length,
      contentAnalyzed:
        textFields.length > 0
          ? `${textFields.length} text elements (summary, description, comments)`
          : "No content could be extracted for analysis",
    };

    return {
      success: true,
      data: sentimentResults,
      presentationHint: "sentiment_analysis",
    };
  } catch (error) {
    console.error(
      `[advancedJiraQueryService] Error analyzing ticket sentiment:`,
      error
    );
    return { success: false, error: error.message };
  }
}

export default {
  getTicketSummary,
  getMTTR,
  getTopNIssues,
  getBugGenerationAnalysis,
  getDataForChartOrTable,
  getSentimentAnalysis,
  understandJiraQuery, // Exposing this for OrchestrationService to use initially
};
