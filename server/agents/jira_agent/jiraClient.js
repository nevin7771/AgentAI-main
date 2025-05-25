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
        timeout: 15000, // 15 seconds timeout
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
// server/agents/jira_agent/jiraClient.js - ENHANCED COMMENT FETCHING

/**
 * CRITICAL FIX: Enhanced comment fetching with better parsing
 */
const fetchAllComments = async (issueKey) => {
  if (!JIRA_URL || !AUTH_TOKEN) {
    throw new Error("Jira API credentials not configured");
  }

  try {
    console.log(`[jiraClient] Fetching comments for issue ${issueKey}`);

    const commentsUrl = `${JIRA_URL}/rest/api/3/issue/${issueKey}/comment`;

    const response = await axios.get(commentsUrl, {
      headers: {
        Authorization: AUTH_TOKEN,
        Accept: "application/json",
      },
      params: {
        maxResults: 100, // Get up to 100 comments
        orderBy: "created", // Order by creation date
        expand: "renderedBody", // Get rendered body for better text extraction
      },
      timeout: 15000, // 15 seconds timeout
    });

    const comments = response.data?.comments || [];
    console.log(
      `[jiraClient] Retrieved ${comments.length} comments for issue ${issueKey}`
    );

    // CRITICAL FIX: Enhanced comment processing with better text extraction
    return comments.map((comment, index) => {
      let commentText = "";

      try {
        // Try to extract text from different possible formats
        if (comment.body) {
          if (typeof comment.body === "string") {
            // Simple string body
            commentText = comment.body;
          } else if (
            comment.body.content &&
            Array.isArray(comment.body.content)
          ) {
            // Atlassian Document Format (ADF)
            commentText = extractTextFromADF(comment.body);
          } else if (comment.body.type) {
            // Single ADF node
            commentText = extractTextFromADF(comment.body);
          }
        }

        // Fallback to rendered body if available
        if (!commentText && comment.renderedBody) {
          commentText = stripHtml(comment.renderedBody);
        }

        // Final fallback
        if (!commentText) {
          commentText = "No comment text available";
        }

        // Clean up the text
        commentText = commentText
          .replace(/\n\s*\n/g, "\n") // Remove extra newlines
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim();
      } catch (textError) {
        console.warn(
          `[jiraClient] Error extracting text from comment ${index}:`,
          textError
        );
        commentText = "Error extracting comment text";
      }

      return {
        id: comment.id,
        author:
          comment.author?.displayName ||
          comment.author?.name ||
          "Unknown Author",
        authorKey: comment.author?.accountId || comment.author?.key,
        created: comment.created,
        updated: comment.updated,
        text: commentText,
        raw: comment, // Keep raw comment for debugging if needed
      };
    });
  } catch (error) {
    console.error(
      `[jiraClient] Error fetching comments for ${issueKey}:`,
      error.response?.data || error.message
    );

    // Return empty array instead of throwing to allow ticket summary to continue
    console.warn(`[jiraClient] Returning empty comments array for ${issueKey}`);
    return [];
  }
};

/**
 * HELPER: Extract text from Atlassian Document Format (ADF)
 */
const extractTextFromADF = (adfNode) => {
  if (!adfNode) return "";

  let text = "";

  const extractFromNode = (node) => {
    if (!node) return;

    // Handle text nodes
    if (node.type === "text" && node.text) {
      text += node.text;
    }

    // Handle different node types
    switch (node.type) {
      case "paragraph":
      case "heading":
        if (node.content) {
          node.content.forEach(extractFromNode);
          text += "\n";
        }
        break;

      case "listItem":
        text += "• ";
        if (node.content) {
          node.content.forEach(extractFromNode);
          text += "\n";
        }
        break;

      case "codeBlock":
        if (node.content) {
          node.content.forEach(extractFromNode);
          text += "\n";
        }
        break;

      case "mention":
        text += `@${node.attrs?.text || "user"}`;
        break;

      case "hardBreak":
        text += "\n";
        break;

      default:
        // For other node types, recursively process content
        if (node.content && Array.isArray(node.content)) {
          node.content.forEach(extractFromNode);
        }
        break;
    }
  };

  if (Array.isArray(adfNode.content)) {
    adfNode.content.forEach(extractFromNode);
  } else {
    extractFromNode(adfNode);
  }

  return text.trim();
};

/**
 * HELPER: Strip HTML tags from text
 */
const stripHtml = (html) => {
  if (!html || typeof html !== "string") return "";

  return html
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace non-breaking spaces
    .replace(/&amp;/g, "&") // Replace HTML entities
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
};

/**
 * ENHANCED: Get issue with better field selection for comments
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
      "project",
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
      timeout: 15000, // 15 seconds timeout
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

export default {
  searchIssues,
  getIssue,
  fetchAllComments,
};
