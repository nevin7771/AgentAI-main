// server/clients/jiraClient.js
// Enhanced version with improved response formatting and query generation

import axios from "axios";
import { generateJqlQuery } from "../orchestration/jqlGenerator.js";

// Fetch Jira credentials from environment variables
const JIRA_URL = process.env.JIRA_API_URL; // e.g., https://your-domain.atlassian.net
const JIRA_EMAIL = process.env.JIRA_API_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;

console.log("[jiraClient] Configuration:");
console.log(`[jiraClient] JIRA_URL: ${JIRA_URL || "Not configured"}`);
console.log(
  `[jiraClient] JIRA_EMAIL: ${
    JIRA_EMAIL ? `${JIRA_EMAIL.substring(0, 3)}...` : "Not configured"
  }`
);
console.log(
  `[jiraClient] JIRA_TOKEN: ${JIRA_TOKEN ? "Configured" : "Not configured"}`
);

// Basic Authentication header value
const AUTH_TOKEN =
  JIRA_EMAIL && JIRA_TOKEN
    ? `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString("base64")}`
    : null;

console.log(`[jiraClient] Auth token generated: ${AUTH_TOKEN ? "Yes" : "No"}`);

/**
 * Fetches all comments for a specific Jira issue
 *
 * @param {string} issueKey - The Jira issue key (e.g., ZSEE-166382)
 * @returns {Promise<Array<object>>} - A promise resolving to an array of comments
 */
const fetchAllComments = async (issueKey) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    console.error(
      "[jiraClient] Jira API not configured. Cannot fetch comments."
    );
    return [];
  }

  try {
    console.log(`[jiraClient] Fetching all comments for issue ${issueKey}`);
    const commentsUrl = `${JIRA_URL}/rest/api/3/issue/${issueKey}/comment`;
    const response = await axios.get(commentsUrl, {
      headers: {
        Authorization: AUTH_TOKEN,
        Accept: "application/json",
      },
      params: {
        maxResults: 100, // Get up to 100 comments
        expand: "renderedBody", // Get rendered HTML version
      },
    });

    const comments = response.data?.comments || [];
    console.log(
      `[jiraClient] Found ${comments.length} comments for issue ${issueKey}`
    );

    return comments.map((comment) => ({
      author: comment.author?.displayName || "Unknown",
      created: comment.created,
      text:
        comment.body?.content
          ?.map((c) => c.content?.map((t) => t.text).join(" ") || "")
          .join("\n") || "No content",
    }));
  } catch (error) {
    console.error(
      `[jiraClient] Error fetching comments for ${issueKey}:`,
      error.message
    );
    return [];
  }
};

/**
 * Enhanced function to get detailed issue information
 *
 * @param {string} issueKey - The Jira issue key (e.g., ZSEE-166382)
 * @param {object} options - Optional parameters including fields to expand
 * @returns {Promise<object>} - A promise resolving to the issue details
 */
const getIssue = async (issueKey, options = {}) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    console.error(
      "[jiraClient] Jira API not configured. Cannot fetch issue details."
    );
    return null;
  }

  try {
    console.log(`[jiraClient] Fetching details for issue ${issueKey}`);

    // Default expand options if not provided
    const expand =
      options.expand ||
      "changelog,renderedFields,names,schema,operations,editmeta,changelog";

    // Default fields to retrieve if not provided
    const fields = options.fields || [
      "summary",
      "description",
      "status",
      "assignee",
      "reporter",
      "priority",
      "created",
      "updated",
      "comment",
      "issuelinks",
      "attachment",
    ];

    const issueUrl = `${JIRA_URL}/rest/api/3/issue/${issueKey}`;
    const response = await axios.get(issueUrl, {
      headers: {
        Authorization: AUTH_TOKEN,
        Accept: "application/json",
      },
      params: {
        expand: expand,
        fields: fields.join(","),
      },
    });

    return response.data;
  } catch (error) {
    console.error(
      `[jiraClient] Error fetching issue ${issueKey}:`,
      error.message
    );
    return null;
  }
};

/**
 * Searches Jira issues based on a natural language query.
 * Converts the query to JQL first, then calls the Jira API.
 *
 * @param {string|object} searchParam - The search query or object with search parameters
 * @param {number} maxResults - Maximum number of issues to return
 * @returns {Promise<Array<object>>} - A promise resolving to an array of Jira issue objects (simplified)
 */
const searchIssues = async (searchParam, maxResults = 10) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    console.error(
      "[jiraClient] Jira URL, Email, or Token not configured in .env. Skipping Jira search."
    );
    console.error(`[jiraClient] JIRA_URL: ${JIRA_URL || "Not configured"}`);
    console.error(
      `[jiraClient] AUTH_TOKEN: ${AUTH_TOKEN ? "Configured" : "Not configured"}`
    );
    // Return an error result with the format expected by the frontend
    return formatResultsForFrontend(
      [
        {
          title: "Jira API Error",
          summary: "Jira API credentials not configured properly.",
          url: null,
          search_engine: "Jira Direct API",
          error: true,
          extra: {
            error_type: "configuration",
            details: "Missing Jira API credentials.",
          },
        },
      ],
      String(searchParam)
    );
  }

  // Handle different parameter types
  let naturalLanguageQuery = "";
  let jqlQuery = null;

  if (typeof searchParam === "string") {
    // Simple string query
    naturalLanguageQuery = searchParam;
    console.log(
      `[jiraClient] Searching Jira for string query: "${naturalLanguageQuery}"`
    );
  } else if (typeof searchParam === "object" && searchParam !== null) {
    // Extract query from the object
    if (searchParam.jql) {
      // Direct JQL query
      jqlQuery = searchParam.jql;
      naturalLanguageQuery = `JQL: ${jqlQuery.substring(0, 30)}...`;
      console.log(`[jiraClient] Searching Jira with JQL: ${jqlQuery}`);
    } else {
      // Try to extract a query from various object properties
      naturalLanguageQuery =
        searchParam.query ||
        searchParam.parameters?.naturalLanguageQuery ||
        "Jira issues";
      console.log(
        `[jiraClient] Searching Jira with object parameter, extracted query: "${naturalLanguageQuery}"`
      );
    }
  } else {
    console.error(
      "[jiraClient] Invalid search parameter type:",
      typeof searchParam
    );
    return formatResultsForFrontend(
      [
        {
          title: "Jira Search Error",
          summary: "Invalid search parameter provided",
          error: true,
          extra: {
            error_type: "invalid_parameter",
            details: `Expected string or object, got ${typeof searchParam}`,
          },
        },
      ],
      String(searchParam)
    );
  }

  try {
    // Check for AI summary language related query
    const aiSummaryLanguageQuery =
      isAiSummaryLanguageQuery(naturalLanguageQuery);

    // 1. Generate JQL from the natural language query or use provided JQL
    console.log(
      `[jiraClient] ${jqlQuery ? "Using provided" : "Generating"} JQL query...`
    );

    let jql;
    if (jqlQuery) {
      // Use the provided JQL directly
      jql = jqlQuery;
    } else if (aiSummaryLanguageQuery) {
      jql = buildAiSummaryJqlQuery(naturalLanguageQuery);
    } else {
      jql = await generateJqlQuery(naturalLanguageQuery);
    }

    console.log(`[jiraClient] ${jqlQuery ? "Using" : "Generated"} JQL: ${jql}`);

    // 2. Call the Jira Search API
    const searchUrl = `${JIRA_URL}/rest/api/3/search`;

    // Determine if we're using a POST or GET request based on JQL length
    let response;
    if (jql.length > 1000) {
      // Long JQL - use POST request
      response = await axios.post(
        searchUrl,
        {
          jql: jql,
          maxResults: maxResults,
          fields: [
            "summary",
            "description",
            "status",
            "assignee",
            "reporter",
            "priority",
            "created",
            "updated",
            "comment",
          ],
        },
        {
          headers: {
            Authorization: AUTH_TOKEN,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          timeout: 15000, // 15 seconds timeout
        }
      );
    } else {
      // Short JQL - use GET request
      response = await axios.get(searchUrl, {
        headers: {
          Authorization: AUTH_TOKEN,
          Accept: "application/json",
        },
        params: {
          jql: jql,
          maxResults: maxResults,
          fields:
            "summary,description,status,assignee,reporter,priority,created,updated,comment",
        },
        timeout: 15000, // 15 seconds timeout
      });
    }

    // 3. Format the results
    const issues = response.data?.issues || [];
    console.log(`[jiraClient] Found ${issues.length} issues.`);

    // Process each issue, with special handling for ZSEE tickets
    const formattedResults = await Promise.all(
      issues.map(async (issue) => {
        let commentChunks = [];

        // Special handling for ZSEE tickets - fetch all comments separately
        if (issue.key && issue.key.includes("ZSEE-")) {
          console.log(
            `[jiraClient] ZSEE ticket detected: ${issue.key} - fetching all comments`
          );
          commentChunks = await fetchAllComments(issue.key);
        } else {
          // Standard comment extraction for non-ZSEE tickets
          commentChunks =
            (issue.fields &&
              issue.fields.comment?.comments?.map((c) =>
                c.body?.content
                  ?.map((c2) => c2.content?.map((t) => t.text).join(" ") || "")
                  .join("\n")
              )) ||
            [];
        }

        return {
          title: `${issue.key}: ${issue.fields?.summary || "No summary"}`,
          summary:
            issue.fields?.description?.content
              ?.map((c) => c.content?.map((t) => t.text).join(" ") || "")
              .join("\n") ||
            issue.fields?.summary ||
            "No description", // Attempt to extract text from description ADF
          url: `${JIRA_URL}/browse/${issue.key}`,
          search_engine: "Jira Direct API",
          chunks: commentChunks, // Use enhanced comments for ZSEE tickets
          extra: {
            key: issue.key,
            status: issue.fields?.status?.name || "Unknown",
            assignee: issue.fields?.assignee?.displayName || "Unassigned",
            reporter: issue.fields?.reporter?.displayName || "Unknown",
            priority: issue.fields?.priority?.name || "None",
            created: issue.fields?.created,
            updated: issue.fields?.updated,
          },
        };
      })
    );

    // Format results for frontend before returning
    return formatResultsForFrontend(formattedResults, naturalLanguageQuery);
  } catch (error) {
    console.error(
      "[jiraClient] Error searching Jira:",
      error.response?.data || error.message
    );

    // Check if it's an authentication error
    let errorItem;
    if (error.response?.status === 401) {
      console.error(
        "[jiraClient] Authentication failed. Check Jira credentials."
      );
      errorItem = {
        title: "Jira Authentication Error",
        summary:
          "Failed to authenticate with Jira API. Please check your credentials.",
        url: null,
        search_engine: "Jira Direct API",
        error: true,
        extra: {
          error_type: "authentication",
          status: 401,
          details: "Invalid username or API token.",
        },
      };
    } else {
      // Generic error
      errorItem = {
        title: "Jira Search Error",
        summary: `Failed to search Jira: ${error.message}`,
        url: null,
        search_engine: "Jira Direct API",
        error: true,
        extra: {
          error_type: "search",
          details: error.response?.data || error.message,
        },
      };
    }

    // Return a formatted error that can be used by the frontend
    return formatResultsForFrontend([errorItem], naturalLanguageQuery);
  }
};

/**
 * Helper function to determine if a query is about AI summary language issues
 *
 * @param {string} query - The query to check
 * @returns {boolean} - True if the query is about AI summary language
 */
function isAiSummaryLanguageQuery(query) {
  const queryLower = query.toLowerCase();
  const aiSummaryTerms = [
    "ai summary",
    "meeting summary",
    "incorrect language",
    "wrong language",
    "language spoken",
    "spoken language",
    "transcription language",
  ];

  // Check if the query contains multiple AI summary related terms
  let matchCount = 0;
  for (const term of aiSummaryTerms) {
    if (queryLower.includes(term)) {
      matchCount++;
    }
  }

  return matchCount >= 2;
}

/**
 * Builds an optimized JQL query for AI summary language issues
 *
 * @param {string} query - The original query
 * @returns {string} - A JQL query optimized for AI summary language issues
 */
function buildAiSummaryJqlQuery(query) {
  return (
    '(summary ~ "AI summary" OR summary ~ "meeting summary" OR summary ~ "language") AND ' +
    '(summary ~ "incorrect" OR summary ~ "wrong" OR summary ~ "not working" OR ' +
    'description ~ "incorrect language" OR description ~ "wrong language" OR ' +
    'description ~ "AI summary") ORDER BY updatedDate DESC'
  );
}

/**
 * Formats the search results to ensure they are compatible with the frontend expectations.
 * This should be called at the end of searchIssues to standardize responses.
 *
 * @param {Array} results - The raw search results
 * @param {string} query - The original search query
 * @returns {Array} - Formatted results with consistent structure
 */
const formatResultsForFrontend = (results, query) => {
  console.log(
    `[jiraClient] Formatting ${results.length} results for frontend display`
  );

  if (!results || results.length === 0) {
    // Return a standardized empty result
    const emptyResult = [
      {
        title: "No Jira results found",
        summary: `No matching Jira issues found for "${query}"`,
        url: null,
        search_engine: "Jira Direct API",
        result: {
          answer: `No matching Jira issues were found for "${query}". Try refining your search or checking for typos.`,
          sources: [],
        },
      },
    ];
    console.log(`[jiraClient] Returning empty result format`);
    return emptyResult;
  }

  // If there's an error in the first result, format it properly
  if (results[0]?.error) {
    const errorResult = [
      {
        ...results[0],
        result: {
          answer:
            results[0].summary ||
            `Error: ${results[0].error || "Unknown error"}`,
          sources: [],
        },
      },
    ];
    console.log(`[jiraClient] Returning error result format`);
    return errorResult;
  }

  // Create a combined answer from multiple results - enhanced with better formatting
  let combinedAnswer = `I've found ${results.length} Jira issue${
    results.length > 1 ? "s" : ""
  } related to "${query}":\n\n`;

  results.forEach((item, index) => {
    // Format each result as a numbered list with consistent formatting
    combinedAnswer += `${index + 1}. **${item.title || "Untitled"}**\n`;

    // Always include status and assignee if available
    if (item.extra && item.extra.status) {
      combinedAnswer += `   * Status: ${item.extra.status}\n`;
    }
    if (item.extra && item.extra.assignee) {
      combinedAnswer += `   * Assignee: ${item.extra.assignee}\n`;
    }

    // For AI summary language queries, include a short summary snippet if available
    if (isAiSummaryLanguageQuery(query) && item.summary) {
      // Limit summary length
      const shortenedSummary =
        item.summary.length > 100
          ? item.summary.substring(0, 100) + "..."
          : item.summary;
      combinedAnswer += `   * Details: ${shortenedSummary}\n`;
    }

    combinedAnswer += "\n";
  });

  // Add the combined answer to the first result
  const enhancedResults = results.map((item, index) => {
    // Create a properly formatted sources array for frontend
    const sourcesArray = results.map((r) => ({
      title: r.title || "Untitled",
      url: r.url || null,
      snippet: r.summary || "",
    }));

    // Ensure each item has the result structure the frontend expects
    const enhancedItem = {
      ...item,
      // CRITICAL: This result property is what the frontend checks first
      result: {
        answer: index === 0 ? combinedAnswer : item.summary || item.title,
        sources: sourcesArray,
      },
    };

    return enhancedItem;
  });

  console.log(
    `[jiraClient] Returning ${enhancedResults.length} enhanced results`
  );
  return enhancedResults;
};

export default {
  searchIssues,
  fetchAllComments,
  formatResultsForFrontend,
  getIssue,
};
