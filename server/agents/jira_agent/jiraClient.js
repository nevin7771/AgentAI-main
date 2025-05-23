// server/agents/jira_agent/jiraClient.js - core functions
import axios from "axios";

// Fetch Jira credentials from environment variables
const JIRA_URL = process.env.JIRA_API_URL;
const JIRA_EMAIL = process.env.JIRA_API_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;

// Basic Authentication header
const AUTH_TOKEN =
  JIRA_EMAIL && JIRA_TOKEN
    ? `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString("base64")}`
    : null;

/**
 * Searches Jira issues based on a JQL query
 * @param {string} jqlQuery - The JQL query to execute
 * @param {number} maxResults - Maximum number of issues to return
 * @returns {Promise<Array>} - A promise resolving to an array of Jira issues
 */
const searchIssues = async (jqlQuery, maxResults = 20) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    throw new Error("Jira API credentials not configured");
  }

  console.log(`[jiraClient] Searching with JQL: ${jqlQuery}`);

  try {
    const searchUrl = `${JIRA_URL}/rest/api/3/search`;

    const response = await axios.post(
      searchUrl,
      {
        jql: jqlQuery,
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
          "resolutiondate",
          "comment",
          "components",
          "project",
        ],
      },
      {
        headers: {
          Authorization: AUTH_TOKEN,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 35000, // 15 seconds timeout
      }
    );

    return response.data?.issues || [];
  } catch (error) {
    console.error(
      "[jiraClient] Error searching Jira:",
      error.response?.data || error.message
    );
    throw error;
  }
};

/**
 * Get a specific Jira issue by key
 * @param {string} issueKey - The Jira issue key (e.g., ZSEE-1234)
 * @param {object} options - Optional parameters
 * @returns {Promise<object>} - Jira issue details
 */
const getIssue = async (issueKey, options = {}) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    throw new Error("Jira API credentials not configured");
  }

  if (!issueKey) {
    throw new Error("Issue key is required");
  }

  try {
    const expand =
      options.expand || "renderedFields,names,schema,changelog,comments";
    const fields = options.fields || [
      "summary",
      "description",
      "status",
      "assignee",
      "reporter",
      "priority",
      "created",
      "updated",
      "resolutiondate",
      "comment",
      "issuelinks",
      "components",
    ];

    console.log(`[jiraClient] Fetching issue ${issueKey}`);

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
      timeout: 10000, // 10 seconds timeout
    });

    console.log(`[jiraClient] Successfully fetched issue ${issueKey}`);
    return response.data;
  } catch (error) {
    console.error(
      `[jiraClient] Error fetching issue ${issueKey}:`,
      error.response?.data || error.message
    );
    throw error;
  }
};

/**
 * Fetches all comments for a specific issue
 * @param {string} issueKey - The Jira issue key
 * @returns {Promise<Array>} - Array of comments
 */
const fetchAllComments = async (issueKey) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    throw new Error("Jira API credentials not configured");
  }

  try {
    const commentsUrl = `${JIRA_URL}/rest/api/3/issue/${issueKey}/comment`;

    const response = await axios.get(commentsUrl, {
      headers: {
        Authorization: AUTH_TOKEN,
        Accept: "application/json",
      },
      params: {
        maxResults: 100,
      },
      timeout: 10000,
    });

    const comments = response.data?.comments || [];
    console.log(
      `[jiraClient] Retrieved ${comments.length} comments for issue ${issueKey}`
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

// In jiraClient.js

/**
 * Enhanced search with better time handling
 */
const searchIssuesWithTimeframe = async (
  jqlQuery,
  timeframe,
  maxResults = 20
) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    throw new Error("Jira API credentials not configured");
  }

  // Add timeframe constraints if needed
  let finalJql = jqlQuery;
  if (timeframe && !jqlQuery.includes("created")) {
    // Parse timeframe string and add to JQL
    if (timeframe === "last week") {
      finalJql += " AND created >= -1w";
    } else if (timeframe === "last month") {
      finalJql += " AND created >= -4w";
    } else if (timeframe === "last day") {
      finalJql += " AND created >= -1d";
    } else if (timeframe === "last quarter") {
      finalJql += " AND created >= -12w";
    }
  }

  console.log(`[jiraClient] Searching with enhanced JQL: ${finalJql}`);

  // Rest of the function remains the same...
  try {
    const searchUrl = `${JIRA_URL}/rest/api/3/search`;

    const response = await axios.post(
      searchUrl,
      {
        jql: finalJql,
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
          "resolutiondate",
          "comment",
          "components",
          "project",
        ],
      }
      // Rest of function same as original
    );

    return response.data?.issues || [];
  } catch (error) {
    console.error(
      "[jiraClient] Error searching Jira:",
      error.response?.data || error.message
    );
    throw error;
  }
};
export default {
  searchIssues,
  getIssue,
  fetchAllComments,
  searchIssuesWithTimeframe,
};
