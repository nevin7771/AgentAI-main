// server/agents/jira_agent/jiraAgentService.js - ENHANCED WITH COMMENT PROCESSING
import llmGatewayService from "../../services/llmGatewayService.js";
import jiraClient from "./jiraClient.js";
import piiSanitizer from "./piiSanitizer.js";
import visualizationGenerator from "./visualizationGenerator.js";

class JiraAgentService {
  constructor() {
    this.maxConcurrentQueries = 4;
    this.maxCommentsForAnalysis = 10;
  }

  /**
   * Main query processing - handles all types of Jira queries
   */
  async processQuery(query, chatHistory = [], options = {}) {
    console.log(
      `[JiraAgentService] Processing comprehensive query: "${query}"`
    );

    try {
      // Step 1: Analyze the query (with fallback)
      const analysisResult = await this.analyzeUserQueryWithFallback(
        query,
        chatHistory
      );

      if (analysisResult.needsClarification) {
        return analysisResult;
      }

      // Step 2: Generate JQL queries based on the analysis
      const jqlQueries = await this.generateJQLQueriesWithFallback(
        analysisResult
      );

      // Step 3: Execute all JQL queries concurrently
      const jiraResults = await this.executeMultipleQueries(jqlQueries);

      // Step 4: Process results based on query intent
      const processedResult = await this.processResultsByIntent(
        query,
        analysisResult,
        jiraResults
      );

      return {
        success: true,
        formattedResponse: processedResult.response,
        sources: processedResult.sources,
        visualization: processedResult.visualization,
        relatedQuestions: processedResult.relatedQuestions,
        queryType: analysisResult.queryType,
        metadata: {
          jqlQueries: jqlQueries.map((q) => q.jql),
          totalResults: jiraResults.reduce(
            (sum, r) => sum + r.results.length,
            0
          ),
          executionTime: processedResult.executionTime,
        },
      };
    } catch (error) {
      console.error(
        "[JiraAgentService] Error in comprehensive processing:",
        error
      );

      // Enhanced fallback to basic processing with comments
      return await this.enhancedFallbackProcessing(query, error);
    }
  }

  /**
   * Enhanced fallback processing WITH comment fetching and summarization
   */
  async enhancedFallbackProcessing(query, originalError) {
    console.log(
      `[JiraAgentService] Using enhanced fallback processing for: "${query}"`
    );

    try {
      // Simple rule-based processing
      const ticketMatch = query.match(/([A-Z]+-\d+)/);

      if (ticketMatch) {
        // Direct ticket summary WITH COMMENTS
        const ticketId = ticketMatch[1];
        console.log(
          `[JiraAgentService] Fetching ticket and comments for: ${ticketId}`
        );

        // Fetch ticket details
        const ticket = await jiraClient.getIssue(ticketId);

        // Fetch comments - this was missing!
        const comments = await jiraClient.fetchAllComments(ticketId);
        console.log(
          `[JiraAgentService] Found ${comments.length} comments for ${ticketId}`
        );

        // Process comments (use latest 10 if more than 20)
        const relevantComments = this.selectRelevantComments(comments);

        // Create enhanced summary with comments
        const response = await this.createEnhancedTicketSummary(
          ticket,
          relevantComments
        );

        return {
          success: true,
          formattedResponse: response,
          sources: [
            {
              title: `${ticket.key}: ${ticket.fields?.summary}`,
              url: `${process.env.JIRA_API_URL}/browse/${ticket.key}`,
              source: "Jira",
              type: "jira",
            },
          ],
          relatedQuestions: [
            `What is the sentiment of comments on ${ticket.key}?`,
            `Find similar issues to ${ticket.key}`,
            `What are the recent updates on ${ticket.key}?`,
          ],
          queryType: "summarize_ticket",
        };
      } else {
        // Basic search with comment processing
        const searchTerms = this.extractSimpleTerms(query);
        const jql = `project = ZSEE AND text ~ "${searchTerms.join(
          " "
        )}" ORDER BY created DESC`;
        const issues = await jiraClient.searchIssues(jql, 10);

        // Fetch comments for top 3 issues
        const issuesWithComments = await this.fetchCommentsForTopIssues(
          issues.slice(0, 3)
        );

        const response = await this.createEnhancedSearchSummary(
          query,
          issuesWithComments,
          issues
        );

        return {
          success: true,
          formattedResponse: response,
          sources: issues.map((issue) => ({
            title: `${issue.key}: ${issue.fields?.summary}`,
            url: `${process.env.JIRA_API_URL}/browse/${issue.key}`,
            source: "Jira",
            type: "jira",
          })),
          relatedQuestions: [
            "Show me more details on these issues",
            "What is the sentiment of these issues?",
            "Find similar patterns in other tickets",
          ],
          queryType: "general_search",
        };
      }
    } catch (fallbackError) {
      console.error(
        `[JiraAgentService] Enhanced fallback processing also failed:`,
        fallbackError
      );

      return {
        success: false,
        formattedResponse: `I encountered an error processing your Jira query: "${query}". 

**Original Error:** ${originalError.message}
**Fallback Error:** ${fallbackError.message}

Please try:
1. A simpler query like "summarize ticket ZSEE-12345"
2. Check if the ticket number is correct
3. Try again in a few moments

If the problem persists, please contact support.`,
        sources: [],
        relatedQuestions: [],
        error: true,
      };
    }
  }

  /**
   * Select relevant comments (latest 10 if more than 20)
   */
  selectRelevantComments(comments) {
    if (!comments || comments.length === 0) {
      return [];
    }

    console.log(`[JiraAgentService] Processing ${comments.length} comments`);

    // If 20 or fewer comments, use all
    if (comments.length <= 20) {
      return comments;
    }

    // If more than 20, use latest 10
    console.log(
      `[JiraAgentService] Using latest ${this.maxCommentsForAnalysis} of ${comments.length} comments`
    );
    return comments.slice(0, this.maxCommentsForAnalysis);
  }

  /**
   * Create enhanced ticket summary with comments
   */
  async createEnhancedTicketSummary(ticket, comments) {
    const formatDate = (dateStr) => {
      try {
        return new Date(dateStr).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch (e) {
        return dateStr;
      }
    };

    const calculateAge = (createdDate) => {
      try {
        const created = new Date(createdDate);
        const now = new Date();
        const diffTime = Math.abs(now - created);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) return "1 day";
        if (diffDays < 30) return `${diffDays} days`;
        if (diffDays < 365)
          return `${Math.floor(diffDays / 30)} month${
            Math.floor(diffDays / 30) > 1 ? "s" : ""
          }`;
        return `${Math.floor(diffDays / 365)} year${
          Math.floor(diffDays / 365) > 1 ? "s" : ""
        }`;
      } catch (e) {
        return "Unknown";
      }
    };

    // Process comments
    const commentSummary = this.summarizeCommentsBasic(comments);

    // Enhanced ticket summary with comments
    let response = `# Jira Ticket Summary (Enhanced)

🆔 **Ticket:** ${ticket.key}
📋 **Summary:** ${ticket.fields?.summary || "No summary available"}
🎯 **Priority:** ${ticket.fields?.priority?.name || "Not specified"}
🛠 **Status:** ${ticket.fields?.status?.name}
👤 **Assignee:** ${ticket.fields?.assignee?.displayName || "Unassigned"}
👥 **Reporter:** ${ticket.fields?.reporter?.displayName || "Not specified"}

## 📅 Timeline
- **Created:** ${formatDate(ticket.fields?.created)}
- **Updated:** ${formatDate(ticket.fields?.updated)}
- **Age:** ${calculateAge(ticket.fields?.created)}

## 🔍 Issue Description
${
  this.extractTextFromDescription(ticket.fields?.description) ||
  "No description available"
}

## 💬 Comment Activity (${comments.length} total comments)
${commentSummary}

## 📊 Ticket Statistics
- **Comments:** ${comments.length}
- **Watchers:** ${ticket.fields?.watches?.watchCount || 0}
- **Votes:** ${ticket.fields?.votes?.votes || 0}

## ✨ Key Insights
- This ticket is currently in "${ticket.fields?.status?.name}" status
- Created ${calculateAge(ticket.fields?.created)} ago
- ${
      comments.length > 0
        ? `Has ${comments.length} comment${
            comments.length === 1 ? "" : "s"
          } with recent activity`
        : "No comments yet"
    }
- ${
      ticket.fields?.assignee
        ? `Assigned to ${ticket.fields.assignee.displayName}`
        : "Currently unassigned"
    }

*Enhanced summary generated: ${new Date().toLocaleString()}*`;

    return response;
  }

  /**
   * Basic comment summarization (without LLM)
   */
  summarizeCommentsBasic(comments) {
    if (!comments || comments.length === 0) {
      return "**No comments available**";
    }

    let summary = `**Recent Activity (${comments.length} comments):**\n\n`;

    // Show latest 5 comments with basic formatting
    const recentComments = comments.slice(0, 5);

    recentComments.forEach((comment, index) => {
      const commentDate = new Date(comment.created).toLocaleDateString();
      const commentText = comment.text
        ? comment.text.length > 150
          ? comment.text.substring(0, 150) + "..."
          : comment.text
        : "No text content";

      summary += `**${comment.author}** (${commentDate}):\n`;
      summary += `${commentText}\n\n`;
    });

    // Add summary stats
    if (comments.length > 5) {
      summary += `*Showing latest 5 of ${comments.length} comments*\n\n`;
    }

    // Basic analysis
    const uniqueAuthors = [...new Set(comments.map((c) => c.author))];
    summary += `**Comment Analysis:**\n`;
    summary += `- **Total Comments:** ${comments.length}\n`;
    summary += `- **Contributors:** ${uniqueAuthors.length} people\n`;
    summary += `- **Most Recent:** ${new Date(
      comments[0]?.created
    ).toLocaleDateString()}\n`;

    if (comments.length > 20) {
      summary += `- **Note:** Showing latest ${this.maxCommentsForAnalysis} comments (total: ${comments.length})\n`;
    }

    return summary;
  }

  /**
   * Fetch comments for top issues in search results
   */
  async fetchCommentsForTopIssues(issues) {
    console.log(
      `[JiraAgentService] Fetching comments for ${issues.length} top issues`
    );

    const issuesWithComments = await Promise.all(
      issues.map(async (issue) => {
        try {
          const comments = await jiraClient.fetchAllComments(issue.key);
          const relevantComments = this.selectRelevantComments(comments);
          return {
            ...issue,
            comments: relevantComments,
            commentCount: comments.length,
          };
        } catch (error) {
          console.error(
            `[JiraAgentService] Error fetching comments for ${issue.key}:`,
            error
          );
          return {
            ...issue,
            comments: [],
            commentCount: 0,
          };
        }
      })
    );

    return issuesWithComments;
  }

  /**
   * Create enhanced search summary with comments
   */
  async createEnhancedSearchSummary(query, issuesWithComments, allIssues) {
    let response = `# Enhanced Search Results for "${query}"

Found ${allIssues.length} matching issues. Analyzed comments for top ${issuesWithComments.length} issues:

`;

    issuesWithComments.forEach((issue, index) => {
      const commentSummary =
        issue.comments.length > 0
          ? `${issue.commentCount} comments (latest: ${new Date(
              issue.comments[0]?.created
            ).toLocaleDateString()})`
          : "No comments";

      response += `## ${index + 1}. ${issue.key}: ${issue.fields?.summary}
- **Status:** ${issue.fields?.status?.name || "Unknown"}
- **Priority:** ${issue.fields?.priority?.name || "Not specified"}
- **Assignee:** ${issue.fields?.assignee?.displayName || "Unassigned"}
- **Created:** ${new Date(issue.fields?.created).toLocaleDateString()}
- **Activity:** ${commentSummary}

`;

      // Add latest comment preview if available
      if (issue.comments.length > 0) {
        const latestComment = issue.comments[0];
        const commentPreview = latestComment.text
          ? latestComment.text.length > 100
            ? latestComment.text.substring(0, 100) + "..."
            : latestComment.text
          : "No text content";

        response += `   💬 **Latest comment** (${latestComment.author}): ${commentPreview}\n\n`;
      }
    });

    // Add remaining issues without comment analysis
    if (allIssues.length > issuesWithComments.length) {
      response += `## Additional Issues (${
        allIssues.length - issuesWithComments.length
      } more):\n`;

      allIssues
        .slice(issuesWithComments.length, Math.min(allIssues.length, 10))
        .forEach((issue, index) => {
          response += `${issuesWithComments.length + index + 1}. **${
            issue.key
          }**: ${issue.fields?.summary} (${issue.fields?.status?.name})\n`;
        });
    }

    response += `\n## 📊 Search Summary
- **Total Issues Found:** ${allIssues.length}
- **Detailed Analysis:** ${issuesWithComments.length} issues
- **Total Comments Analyzed:** ${issuesWithComments.reduce(
      (sum, issue) => sum + issue.commentCount,
      0
    )}
- **Active Issues:** ${
      allIssues.filter(
        (i) =>
          i.fields?.status?.name !== "Closed" &&
          i.fields?.status?.name !== "Resolved"
      ).length
    }

*Enhanced search completed: ${new Date().toLocaleString()}*`;

    return response;
  }

  /**
   * Extract text from Jira description (handles ADF format)
   */
  extractTextFromDescription(description) {
    if (!description) return "";

    if (typeof description === "string") {
      return description.length > 500
        ? description.substring(0, 500) + "..."
        : description;
    }

    try {
      // Handle Atlassian Document Format
      if (description.content && Array.isArray(description.content)) {
        let text = "";
        const extractText = (node) => {
          if (node.type === "text" && node.text) {
            text += node.text + " ";
          } else if (node.content && Array.isArray(node.content)) {
            node.content.forEach(extractText);
          }
        };
        description.content.forEach(extractText);
        const cleanText = text.trim();
        return cleanText.length > 500
          ? cleanText.substring(0, 500) + "..."
          : cleanText;
      }
    } catch (error) {
      console.warn(
        `[JiraAgentService] Error extracting description text:`,
        error
      );
    }

    return "Description format not supported";
  }

  // Keep all the other existing methods (analyzeUserQueryWithFallback, generateJQLQueriesWithFallback, etc.)
  // from the previous version...

  /**
   * Analyze user query with robust error handling and fallback
   */
  async analyzeUserQueryWithFallback(query, chatHistory = []) {
    try {
      const analysisPrompt = `Analyze this Jira query and respond with valid JSON only:

Query: "${query}"

Respond with only this JSON format (no extra text):
{
  "queryType": "summarize_ticket",
  "searchTerms": ["key", "terms"],
  "timeConstraint": {"type": "none", "value": "", "days": 7},
  "priority": null,
  "customer": null,
  "ticketId": null,
  "limit": 10,
  "needsClarification": false
}

Query types: summarize_ticket, sentiment_analysis, create_chart, find_similar, mttr_analysis, top_issues, trending_tickets, customer_issues, general_search`;

      console.log(
        `[JiraAgentService] Calling LLM Gateway for query analysis...`
      );

      const response = await llmGatewayService.query(analysisPrompt, [], {
        model: "claude-3-7-sonnet-20250219",
        temperature: 0.1,
      });

      console.log(`[JiraAgentService] LLM Gateway response:`, response);

      if (!response || !response.content) {
        console.warn(`[JiraAgentService] Empty response from LLM Gateway`);
        throw new Error("Empty response from LLM Gateway");
      }

      let analysis;
      try {
        let cleanContent = response.content.trim();

        if (cleanContent.startsWith("```json")) {
          cleanContent = cleanContent
            .replace(/```json\n?/, "")
            .replace(/\n?```$/, "");
        } else if (cleanContent.startsWith("```")) {
          cleanContent = cleanContent
            .replace(/```\n?/, "")
            .replace(/\n?```$/, "");
        }

        console.log(
          `[JiraAgentService] Cleaned response content:`,
          cleanContent
        );

        analysis = JSON.parse(cleanContent);
        console.log(
          `[JiraAgentService] Successfully parsed analysis:`,
          analysis
        );
      } catch (parseError) {
        console.error(`[JiraAgentService] JSON parse error:`, parseError);
        console.error(
          `[JiraAgentService] Raw response content:`,
          response.content
        );
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }

      analysis = this.validateAndDefaultAnalysis(analysis, query);
      return analysis;
    } catch (error) {
      console.error("[JiraAgentService] Error in LLM query analysis:", error);
      console.log(`[JiraAgentService] Using fallback rule-based analysis`);
      return this.fallbackQueryAnalysis(query);
    }
  }

  /**
   * Validate analysis result and set defaults
   */
  validateAndDefaultAnalysis(analysis, query) {
    const validated = {
      queryType: analysis.queryType || "general_search",
      searchTerms: Array.isArray(analysis.searchTerms)
        ? analysis.searchTerms
        : this.extractSimpleTerms(query),
      timeConstraint: analysis.timeConstraint || {
        type: "none",
        value: "",
        days: 7,
      },
      priority: analysis.priority || null,
      customer: analysis.customer || null,
      ticketId: analysis.ticketId || this.extractTicketId(query),
      limit: analysis.limit || 10,
      needsClarification: analysis.needsClarification || false,
      clarificationQuestion: analysis.clarificationQuestion || null,
    };

    if (!validated.ticketId) {
      const ticketMatch = query.match(/([A-Z]+-\d+)/);
      if (ticketMatch) {
        validated.ticketId = ticketMatch[1];
        validated.queryType = "summarize_ticket";
      }
    }

    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes("sentiment") || lowerQuery.includes("feeling")) {
      validated.queryType = "sentiment_analysis";
    } else if (
      lowerQuery.includes("chart") ||
      lowerQuery.includes("graph") ||
      lowerQuery.includes("visual")
    ) {
      validated.queryType = "create_chart";
    } else if (
      lowerQuery.includes("similar") ||
      lowerQuery.includes("like this")
    ) {
      validated.queryType = "find_similar";
    } else if (
      lowerQuery.includes("mttr") ||
      lowerQuery.includes("resolution time")
    ) {
      validated.queryType = "mttr_analysis";
    } else if (lowerQuery.includes("top") || lowerQuery.includes("highest")) {
      validated.queryType = "top_issues";
    } else if (lowerQuery.includes("trend") || lowerQuery.includes("pattern")) {
      validated.queryType = "trending_tickets";
    }

    console.log(`[JiraAgentService] Validated analysis:`, validated);
    return validated;
  }

  /**
   * Fallback rule-based query analysis
   */
  fallbackQueryAnalysis(query) {
    console.log(
      `[JiraAgentService] Performing rule-based analysis for: "${query}"`
    );

    const lowerQuery = query.toLowerCase();
    let queryType = "general_search";

    const ticketMatch = query.match(/([A-Z]+-\d+)/);
    const ticketId = ticketMatch ? ticketMatch[1] : null;

    if (ticketId) {
      queryType = "summarize_ticket";
    } else if (lowerQuery.includes("sentiment")) {
      queryType = "sentiment_analysis";
    } else if (lowerQuery.includes("chart") || lowerQuery.includes("graph")) {
      queryType = "create_chart";
    } else if (lowerQuery.includes("similar")) {
      queryType = "find_similar";
    } else if (lowerQuery.includes("mttr")) {
      queryType = "mttr_analysis";
    } else if (lowerQuery.includes("top")) {
      queryType = "top_issues";
    }

    const searchTerms = this.extractSimpleTerms(query);

    let timeConstraint = { type: "none", value: "", days: 7 };
    if (lowerQuery.includes("this week")) {
      timeConstraint = { type: "relative", value: "this_week", days: 7 };
    } else if (lowerQuery.includes("last week")) {
      timeConstraint = { type: "relative", value: "last_week", days: 14 };
    } else if (lowerQuery.includes("recently")) {
      timeConstraint = { type: "relative", value: "recently", days: 7 };
    }

    return {
      queryType,
      searchTerms,
      timeConstraint,
      priority: null,
      customer: null,
      ticketId,
      limit: 10,
      needsClarification: false,
    };
  }

  /**
   * Extract simple search terms from query
   */
  extractSimpleTerms(query) {
    const stopWords = new Set([
      "the",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "this",
      "that",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "being",
      "have",
      "has",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "could",
      "should",
      "may",
      "might",
      "must",
      "can",
      "jira",
      "ticket",
      "issue",
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !stopWords.has(term))
      .slice(0, 5);
  }

  /**
   * Extract ticket ID from query
   */
  extractTicketId(query) {
    const match = query.match(/([A-Z]+-\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Generate JQL queries with fallback
   */
  async generateJQLQueriesWithFallback(analysis) {
    try {
      const jqlPrompt = `Generate JQL queries for: ${analysis.queryType}
Search terms: ${analysis.searchTerms.join(", ")}
Time constraint: ${analysis.timeConstraint.value}

Create 1-2 JQL queries. Respond with valid JSON only:
{
  "queries": [
    {
      "name": "primary",
      "jql": "project = ZSEE AND ...",
      "maxResults": 25,
      "purpose": "Main search"
    }
  ]
}`;

      const response = await llmGatewayService.query(jqlPrompt, [], {
        model: "claude-3-7-sonnet-20250219",
        temperature: 0.2,
      });

      if (response?.content) {
        try {
          let cleanContent = response.content.trim();
          if (cleanContent.startsWith("```json")) {
            cleanContent = cleanContent
              .replace(/```json\n?/, "")
              .replace(/\n?```$/, "");
          }

          const jqlResult = JSON.parse(cleanContent);
          if (jqlResult.queries && Array.isArray(jqlResult.queries)) {
            console.log(
              `[JiraAgentService] Generated ${jqlResult.queries.length} JQL queries with LLM`
            );
            return jqlResult.queries;
          }
        } catch (parseError) {
          console.warn(
            `[JiraAgentService] Failed to parse JQL response, using fallback`
          );
        }
      }
    } catch (error) {
      console.warn(
        `[JiraAgentService] LLM JQL generation failed, using fallback:`,
        error.message
      );
    }

    return this.generateFallbackJQL(analysis);
  }

  /**
   * Generate fallback JQL queries using rules
   */
  generateFallbackJQL(analysis) {
    console.log(
      `[JiraAgentService] Generating fallback JQL for ${analysis.queryType}`
    );

    const baseProject = "project = ZSEE";
    let queries = [];

    if (analysis.ticketId) {
      queries.push({
        name: "direct_ticket",
        jql: `key = ${analysis.ticketId}`,
        maxResults: 1,
        purpose: `Get specific ticket ${analysis.ticketId}`,
      });
    } else {
      let searchClause = "";
      if (analysis.searchTerms.length > 0) {
        searchClause = `text ~ "${analysis.searchTerms.join(" ")}"`;
      }

      let timeClause = "";
      if (analysis.timeConstraint.type === "relative") {
        if (analysis.timeConstraint.value === "this_week") {
          timeClause = "created >= startOfWeek()";
        } else if (analysis.timeConstraint.value === "recently") {
          timeClause = "created >= -7d";
        } else {
          timeClause = `created >= -${analysis.timeConstraint.days}d`;
        }
      }

      let jqlParts = [baseProject];
      if (searchClause) jqlParts.push(searchClause);
      if (timeClause) jqlParts.push(timeClause);
      if (analysis.priority)
        jqlParts.push(`priority >= ${analysis.priority[0]}`);

      const primaryJQL = jqlParts.join(" AND ") + " ORDER BY created DESC";

      queries.push({
        name: "primary",
        jql: primaryJQL,
        maxResults: analysis.limit || 20,
        purpose: "Primary search query",
      });

      if (analysis.searchTerms.length > 1) {
        const broaderTerms = analysis.searchTerms.slice(0, 2);
        const broaderJQL = `${baseProject} AND text ~ "${broaderTerms.join(
          " "
        )}" ORDER BY created DESC`;

        queries.push({
          name: "broader",
          jql: broaderJQL,
          maxResults: 15,
          purpose: "Broader search with fewer terms",
        });
      }
    }

    console.log(
      `[JiraAgentService] Generated ${queries.length} fallback JQL queries`
    );
    return queries;
  }

  /**
   * Execute multiple JQL queries concurrently with error handling
   */
  async executeMultipleQueries(jqlQueries) {
    console.log(
      `[JiraAgentService] Executing ${jqlQueries.length} JQL queries concurrently`
    );

    const queryPromises = jqlQueries.map(async (queryObj) => {
      try {
        console.log(`[JiraAgentService] Executing: ${queryObj.jql}`);
        const results = await jiraClient.searchIssues(
          queryObj.jql,
          queryObj.maxResults
        );

        return {
          name: queryObj.name,
          purpose: queryObj.purpose,
          jql: queryObj.jql,
          results: results,
          resultCount: results.length,
        };
      } catch (error) {
        console.error(
          `[JiraAgentService] Query ${queryObj.name} failed:`,
          error
        );
        return {
          name: queryObj.name,
          purpose: queryObj.purpose,
          jql: queryObj.jql,
          results: [],
          resultCount: 0,
          error: error.message,
        };
      }
    });

    const results = await Promise.all(queryPromises);

    const totalResults = results.reduce((sum, r) => sum + r.resultCount, 0);
    console.log(
      `[JiraAgentService] Query execution complete. Total results: ${totalResults}`
    );

    return results;
  }

  /**
   * Process results by intent with comment handling
   */
  async processResultsByIntent(originalQuery, analysis, jiraResults) {
    const startTime = Date.now();

    const allIssues = this.combineAndDeduplicateResults(jiraResults);
    console.log(
      `[JiraAgentService] Processing ${allIssues.length} unique issues for intent: ${analysis.queryType}`
    );

    try {
      let result;

      if (analysis.queryType === "summarize_ticket" && analysis.ticketId) {
        result = await this.processComprehensiveTicketSummary(
          analysis.ticketId,
          allIssues
        );
      } else {
        result = await this.processComprehensiveSearch(
          originalQuery,
          allIssues,
          analysis
        );
      }

      result.executionTime = Date.now() - startTime;
      return result;
    } catch (error) {
      console.error(
        `[JiraAgentService] Error in comprehensive result processing:`,
        error
      );

      return {
        response: `Found ${allIssues.length} results for "${originalQuery}" but encountered an error in comprehensive processing. Using fallback...`,
        sources: allIssues.slice(0, 5).map((issue) => ({
          title: `${issue.key}: ${issue.fields?.summary}`,
          url: `${process.env.JIRA_API_URL}/browse/${issue.key}`,
          source: "Jira",
          type: "jira",
        })),
        visualization: null,
        relatedQuestions: [],
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Comprehensive ticket summary processing WITH comments
   */
  async processComprehensiveTicketSummary(ticketId, allIssues) {
    let targetIssue = allIssues.find((issue) => issue.key === ticketId);

    if (!targetIssue) {
      try {
        targetIssue = await jiraClient.getIssue(ticketId);
      } catch (error) {
        return {
          response: `Ticket ${ticketId} not found or not accessible: ${error.message}`,
          sources: [],
          visualization: null,
          relatedQuestions: [],
        };
      }
    }

    // Fetch comments
    const comments = await jiraClient.fetchAllComments(ticketId);
    const relevantComments = this.selectRelevantComments(comments);

    // Use LLM for comprehensive summary if available
    try {
      const summaryPrompt = `Create a comprehensive Jira ticket summary with comment analysis:

Ticket Data: ${JSON.stringify(targetIssue, null, 2)}
Comments (${relevantComments.length} of ${
        comments.length
      } total): ${JSON.stringify(relevantComments, null, 2)}

Format as a manager-friendly summary with:
# Jira Ticket Summary
🆔 **Ticket:** ${targetIssue.key}
📋 **Summary:** [ticket summary]
🎯 **Priority:** [priority level]
🛠 **Status:** [current status]
👤 **Assignee:** [assignee name]
👥 **Reporter:** [reporter name]

## 📅 Timeline
- **Created:** [formatted date]
- **Updated:** [formatted date]  
- **Age:** [calculated age]

## 🔍 Issue Overview
[Brief description of the issue]

## 💬 Comment Analysis (${comments.length} total)
[Summarize the key points from comments, recent activity, and any patterns]

## ✨ Key Insights
[Important observations and next steps based on ticket data and comments]

Keep it concise but comprehensive, focusing on actionable insights.`;

      const response = await llmGatewayService.query(summaryPrompt, [], {
        model: "claude-3-7-sonnet-20250219",
        temperature: 0.3,
      });

      if (response?.content) {
        return {
          response: response.content,
          sources: [
            {
              title: `${targetIssue.key}: ${targetIssue.fields?.summary}`,
              url: `${process.env.JIRA_API_URL}/browse/${targetIssue.key}`,
              source: "Jira",
              type: "jira",
            },
          ],
          visualization: null,
          relatedQuestions: [
            `What is the sentiment of comments on ${targetIssue.key}?`,
            `Find similar issues to ${targetIssue.key}`,
            `What is the resolution pattern for this type of issue?`,
          ],
        };
      }
    } catch (error) {
      console.warn(
        `[JiraAgentService] LLM summary failed, using enhanced fallback:`,
        error
      );
    }

    // Fallback to enhanced summary
    const enhancedSummary = await this.createEnhancedTicketSummary(
      targetIssue,
      relevantComments
    );

    return {
      response: enhancedSummary,
      sources: [
        {
          title: `${targetIssue.key}: ${targetIssue.fields?.summary}`,
          url: `${process.env.JIRA_API_URL}/browse/${targetIssue.key}`,
          source: "Jira",
          type: "jira",
        },
      ],
      visualization: null,
      relatedQuestions: [
        `What is the sentiment of comments on ${targetIssue.key}?`,
        `Find similar issues to ${targetIssue.key}`,
        `What are the recent updates on ${targetIssue.key}?`,
      ],
    };
  }

  /**
   * Comprehensive search processing WITH comments
   */
  async processComprehensiveSearch(query, allIssues, analysis) {
    // Fetch comments for top issues
    const issuesWithComments = await this.fetchCommentsForTopIssues(
      allIssues.slice(0, 5)
    );

    // Use LLM for comprehensive analysis if available
    try {
      const searchPrompt = `Analyze these Jira search results with comment data:

Search Query: "${query}"
Issues with Comments: ${JSON.stringify(issuesWithComments, null, 2)}
Total Issues: ${allIssues.length}

Create a comprehensive analysis with:
# Search Results Analysis for "${query}"

## 🔍 Overview
Found ${allIssues.length} matching issues

## 📊 Key Findings
[Analyze patterns, priorities, and themes]

## 💬 Comment Insights
[Analyze comment patterns, user sentiment, recent activity]

## 🎯 Priority Issues
[Highlight most important issues]

## 💡 Recommendations
[Actionable insights based on the data]

Focus on actionable insights and patterns.`;

      const response = await llmGatewayService.query(searchPrompt, [], {
        model: "claude-3-7-sonnet-20250219",
        temperature: 0.3,
      });

      if (response?.content) {
        return {
          response: response.content,
          sources: allIssues.slice(0, 10).map((issue) => ({
            title: `${issue.key}: ${issue.fields?.summary}`,
            url: `${process.env.JIRA_API_URL}/browse/${issue.key}`,
            source: "Jira",
            type: "jira",
          })),
          visualization: null,
          relatedQuestions: [
            "What are the common themes in these results?",
            "How can we categorize these issues better?",
            "What patterns emerge from the comments?",
          ],
        };
      }
    } catch (error) {
      console.warn(
        `[JiraAgentService] LLM search analysis failed, using enhanced fallback:`,
        error
      );
    }

    // Fallback to enhanced search summary
    const enhancedSummary = await this.createEnhancedSearchSummary(
      query,
      issuesWithComments,
      allIssues
    );

    return {
      response: enhancedSummary,
      sources: allIssues.slice(0, 10).map((issue) => ({
        title: `${issue.key}: ${issue.fields?.summary}`,
        url: `${process.env.JIRA_API_URL}/browse/${issue.key}`,
        source: "Jira",
        type: "jira",
      })),
      visualization: null,
      relatedQuestions: [
        "Show me more details on these issues",
        "What is the sentiment of these issues?",
        "Find similar patterns in other tickets",
      ],
    };
  }

  /**
   * Combine and deduplicate results from multiple queries
   */
  combineAndDeduplicateResults(jiraResults) {
    const seenKeys = new Set();
    const combinedIssues = [];

    jiraResults.forEach((queryResult) => {
      queryResult.results.forEach((issue) => {
        if (!seenKeys.has(issue.key)) {
          seenKeys.add(issue.key);
          combinedIssues.push({
            ...issue,
            _sourceQuery: queryResult.name,
          });
        }
      });
    });

    return combinedIssues;
  }
}

export default new JiraAgentService();
