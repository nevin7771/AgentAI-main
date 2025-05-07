// server/clients/jiraClient.js
// Updated to use environment variables and dynamic JQL

import axios from "axios";
import { generateJqlQuery } from "../orchestration/jqlGenerator.js";

// Fetch Jira credentials from environment variables
const JIRA_URL = process.env.JIRA_API_URL; // e.g., https://your-domain.atlassian.net
const JIRA_EMAIL = process.env.JIRA_API_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;

console.log("[jiraClient] Configuration:");
console.log(`[jiraClient] JIRA_URL: ${JIRA_URL || 'Not configured'}`);
console.log(`[jiraClient] JIRA_EMAIL: ${JIRA_EMAIL ? `${JIRA_EMAIL.substring(0, 3)}...` : 'Not configured'}`);
console.log(`[jiraClient] JIRA_TOKEN: ${JIRA_TOKEN ? 'Configured' : 'Not configured'}`);

// Basic Authentication header value
const AUTH_TOKEN =
  JIRA_EMAIL && JIRA_TOKEN
    ? `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString("base64")}`
    : null;
    
console.log(`[jiraClient] Auth token generated: ${AUTH_TOKEN ? 'Yes' : 'No'}`);

/**
 * Fetches all comments for a specific Jira issue
 * 
 * @param {string} issueKey - The Jira issue key (e.g., ZSEE-166382)
 * @returns {Promise<Array<object>>} - A promise resolving to an array of comments
 */
const fetchAllComments = async (issueKey) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    console.error("[jiraClient] Jira API not configured. Cannot fetch comments.");
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
      }
    });
    
    const comments = response.data?.comments || [];
    console.log(`[jiraClient] Found ${comments.length} comments for issue ${issueKey}`);
    
    return comments.map(comment => ({
      author: comment.author?.displayName || "Unknown",
      created: comment.created,
      text: comment.body?.content
        ?.map(c => c.content?.map(t => t.text).join(" ") || "")
        .join("\n") || "No content"
    }));
  } catch (error) {
    console.error(`[jiraClient] Error fetching comments for ${issueKey}:`, error.message);
    return [];
  }
};

/**
 * Searches Jira issues based on a natural language query.
 * Converts the query to JQL first, then calls the Jira API.
 *
 * @param {string} naturalLanguageQuery - The user\s query in natural language.
 * @param {number} maxResults - Maximum number of issues to return.
 * @returns {Promise<Array<object>>} - A promise resolving to an array of Jira issue objects (simplified).
 */
const searchIssues = async (naturalLanguageQuery, maxResults = 5) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    console.error(
      "[jiraClient] Jira URL, Email, or Token not configured in .env. Skipping Jira search."
    );
    console.error(`[jiraClient] JIRA_URL: ${JIRA_URL || 'Not configured'}`);
    console.error(`[jiraClient] AUTH_TOKEN: ${AUTH_TOKEN ? 'Configured' : 'Not configured'}`);
    // Return an empty array with error information for the frontend
    return [{
      title: "Jira API Error",
      summary: "Jira API credentials not configured properly.",
      url: null,
      search_engine: "Jira Direct API",
      error: true,
      extra: {
        error_type: "configuration",
        details: "Missing Jira API credentials."
      }
    }];
  }

  console.log(`[jiraClient] Searching Jira for: "${naturalLanguageQuery}"`);

  try {
    // 1. Generate JQL from the natural language query
    console.log(`[jiraClient] Generating JQL query...`);
    const jql = await generateJqlQuery(naturalLanguageQuery);
    console.log(`[jiraClient] Generated JQL: ${jql}`);

    // 2. Call the Jira Search API
    const searchUrl = `${JIRA_URL}/rest/api/3/search`;
    const response = await axios.post(
      searchUrl,
      {
        jql: jql,
        maxResults: maxResults,
        fields: [
          // Specify fields to retrieve
          "summary",
          "description",
          "status",
          "assignee",
          "reporter",
          "priority",
          "created",
          "updated",
          "comment", // Include comments
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

    // 3. Format the results
    const issues = response.data?.issues || [];
    console.log(`[jiraClient] Found ${issues.length} issues.`);

    // Process each issue, with special handling for ZSEE tickets
    const formattedResults = await Promise.all(issues.map(async (issue) => {
      let commentChunks = [];
      
      // Special handling for ZSEE tickets - fetch all comments separately
      if (issue.key.includes("ZSEE-")) {
        console.log(`[jiraClient] ZSEE ticket detected: ${issue.key} - fetching all comments`);
        commentChunks = await fetchAllComments(issue.key);
      } else {
        // Standard comment extraction for non-ZSEE tickets
        commentChunks = issue.fields.comment?.comments?.map((c) =>
          c.body?.content
            ?.map((c2) => c2.content?.map((t) => t.text).join(" ") || "")
            .join("\n")
        ) || [];
      }
      
      return {
        title: `${issue.key}: ${issue.fields.summary}`,
        summary:
          issue.fields.description?.content
            ?.map((c) => c.content?.map((t) => t.text).join(" ") || "")
            .join("\n") || issue.fields.summary, // Attempt to extract text from description ADF
        url: `${JIRA_URL}/browse/${issue.key}`,
        search_engine: "Jira Direct API",
        chunks: commentChunks, // Use enhanced comments for ZSEE tickets
        extra: {
          key: issue.key,
          status: issue.fields.status?.name,
          assignee: issue.fields.assignee?.displayName,
          reporter: issue.fields.reporter?.displayName,
          priority: issue.fields.priority?.name,
          created: issue.fields.created,
          updated: issue.fields.updated,
        },
      };
    }));

    return formattedResults;
  } catch (error) {
    console.error(
      "[jiraClient] Error searching Jira:",
      error.response?.data || error.message
    );
    
    // Check if it's an authentication error
    if (error.response?.status === 401) {
      console.error("[jiraClient] Authentication failed. Check Jira credentials.");
      return [{
        title: "Jira Authentication Error",
        summary: "Failed to authenticate with Jira API. Please check your credentials.",
        url: null,
        search_engine: "Jira Direct API",
        error: true,
        extra: {
          error_type: "authentication",
          status: 401,
          details: "Invalid username or API token."
        }
      }];
    }
    
    // Return a formatted error object that can be used by the frontend
    return [{
      title: "Jira Search Error",
      summary: `Failed to search Jira: ${error.message}`,
      url: null,
      search_engine: "Jira Direct API",
      error: true,
      extra: {
        error_type: "search",
        details: error.response?.data || error.message
      }
    }];
  }
};

export default {
  searchIssues,
  fetchAllComments,
};
