// server/agents/jira_agent/jiraAgentService.js - FIXED COMPONENT FIELD VERSION
import llmGatewayService from "../../services/llmGatewayService.js";
import jiraClient from "./jiraClient.js";
import piiSanitizer from "./piiSanitizer.js";
import visualizationGenerator from "./visualizationGenerator.js";

class JiraAgentService {
  constructor() {
    this.maxConcurrentQueries = 4;
    this.maxCommentsForAnalysis = 5;
  }

  /**
   * CRITICAL FIX: Add the missing getTicketSummary function
   */
  async getTicketSummary(ticketId) {
    console.log(`[JiraAgentService] Getting ticket summary for: ${ticketId}`);

    try {
      // Fetch ticket details
      const ticket = await jiraClient.getIssue(ticketId);

      // CRITICAL FIX: Fetch ALL comments, then get last 5 properly
      const allComments = await jiraClient.fetchAllComments(ticketId);

      // Get the MOST RECENT 5 comments (reverse order, then take first 5)
      const lastFiveComments = allComments
        .sort((a, b) => new Date(b.created) - new Date(a.created)) // Sort by date descending
        .slice(0, 5); // Take most recent 5

      console.log(
        `[JiraAgentService] Found ${allComments.length} total comments, using ${lastFiveComments.length} most recent for summary`
      );

      // CRITICAL FIX: Enhanced summary with proper comment analysis
      const formattedResponse =
        await this.createEnhancedTicketSummaryWithComments(
          ticket,
          lastFiveComments,
          allComments.length
        );

      return {
        success: true,
        formattedResponse: formattedResponse,
        sources: [],
        ticket: ticket,
        relatedQuestions: [
          `Do sentiment analysis for ${ticketId}`,
          `Find similar issues to ${ticketId}`,
          `What is the resolution timeline for ${ticketId}?`,
          `Show me all comments for ${ticketId}`,
        ],
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error getting ticket summary:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error retrieving ticket ${ticketId}: ${error.message}`,
        sources: [],
      };
    }
  }

  async createEnhancedTicketSummaryWithComments(
    ticket,
    lastFiveComments,
    totalComments
  ) {
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

    // CRITICAL FIX: Enhanced comment analysis with Claude
    let commentAnalysis = {
      summary: "",
      sentiment: "neutral",
      keyPoints: [],
      latestStatus: "",
    };

    if (lastFiveComments.length > 0) {
      try {
        // CRITICAL FIX: Prepare comments with proper structure for Claude
        const commentsForAnalysis = lastFiveComments.map((comment, index) => ({
          order: index + 1,
          author: comment.author || "Unknown",
          date: formatDate(comment.created),
          text: comment.text || "No content",
        }));

        const commentsText = commentsForAnalysis
          .map(
            (comment) =>
              `[${comment.order}] ${comment.author} (${comment.date}): ${comment.text}`
          )
          .join("\n\n");

        console.log(
          `[JiraAgentService] Sending ${commentsForAnalysis.length} comments to Claude for analysis`
        );

        const analysisPrompt = `Analyze these Jira ticket comments (most recent 5 of ${totalComments} total) and provide detailed insights:
  
  TICKET: ${ticket.key} - ${ticket.fields?.summary || "No summary"}
  
  RECENT COMMENTS:
  ${commentsText}
  
  Please provide:
  1. SUMMARY: 2-3 sentence summary of recent activity and discussions
  2. SENTIMENT: Overall sentiment (Positive/Negative/Neutral/Mixed) with brief explanation
  3. KEY_POINTS: 3-4 main points or decisions from the comments
  4. CURRENT_STATUS: What's the latest status or next steps mentioned
  
  Format your response as:
  SUMMARY: [your summary]
  SENTIMENT: [sentiment] - [explanation]
  KEY_POINTS: 
  - [point 1]
  - [point 2] 
  - [point 3]
  CURRENT_STATUS: [current status/next steps]`;

        const response = await llmGatewayService.query(analysisPrompt, [], {
          model: "claude-3-5-sonnet-20241022",
          temperature: 0.3,
          max_tokens: 1000,
        });

        if (response?.content) {
          const analysisText = response.content;
          console.log(
            `[JiraAgentService] Received comment analysis from Claude`
          );

          // Parse Claude's response
          const summaryMatch = analysisText.match(
            /SUMMARY:\s*(.+?)(?=SENTIMENT:|$)/s
          );
          const sentimentMatch = analysisText.match(
            /SENTIMENT:\s*(.+?)(?=KEY_POINTS:|$)/s
          );
          const keyPointsMatch = analysisText.match(
            /KEY_POINTS:\s*(.+?)(?=CURRENT_STATUS:|$)/s
          );
          const statusMatch = analysisText.match(/CURRENT_STATUS:\s*(.+?)$/s);

          commentAnalysis = {
            summary: summaryMatch
              ? summaryMatch[1].trim()
              : analysisText.substring(0, 200),
            sentiment: sentimentMatch ? sentimentMatch[1].trim() : "neutral",
            keyPoints: keyPointsMatch
              ? keyPointsMatch[1]
                  .trim()
                  .split("\n")
                  .filter((p) => p.trim())
                  .map((p) => p.replace(/^-\s*/, ""))
              : [],
            latestStatus: statusMatch
              ? statusMatch[1].trim()
              : "No recent status updates",
          };
        }
      } catch (error) {
        console.error(`[JiraAgentService] Comment analysis failed:`, error);
        commentAnalysis.summary =
          "Unable to analyze comments - showing recent activity instead";
      }
    }

    const ticketUrl = `${process.env.JIRA_API_URL}/browse/${ticket.key}`;

    let response = `# 🎫 Jira Ticket Summary\n\n`;
    response += `**🆔 Ticket:** [${ticket.key}](${ticketUrl})\n`;
    response += `**📋 Summary:** ${
      ticket.fields?.summary || "No summary available"
    }\n`;
    response += `**🎯 Priority:** ${
      ticket.fields?.priority?.name || "Not specified"
    }\n`;
    response += `**🛠 Status:** ${ticket.fields?.status?.name}\n`;
    response += `**👤 Assignee:** ${
      ticket.fields?.assignee?.displayName || "Unassigned"
    }\n`;
    response += `**👥 Reporter:** ${
      ticket.fields?.reporter?.displayName || "Not specified"
    }\n\n`;

    response += `## 📅 Timeline\n`;
    response += `- **Created:** ${formatDate(ticket.fields?.created)}\n`;
    response += `- **Updated:** ${formatDate(ticket.fields?.updated)}\n`;
    if (ticket.fields?.resolutiondate) {
      response += `- **Resolved:** ${formatDate(
        ticket.fields.resolutiondate
      )}\n`;
    }
    response += `\n`;

    response += `## 🔍 Issue Description\n`;
    const description = this.extractTextFromDescription(
      ticket.fields?.description
    );
    response += `${description || "No description available"}\n\n`;

    // CRITICAL FIX: Enhanced comment section with analysis
    if (totalComments > 0) {
      response += `## 💬 Comment Analysis (${lastFiveComments.length} recent of ${totalComments} total)\n\n`;

      if (
        commentAnalysis.summary &&
        commentAnalysis.summary !==
          "Unable to analyze comments - showing recent activity instead"
      ) {
        response += `### 📝 Summary\n${commentAnalysis.summary}\n\n`;

        response += `### 😊 Sentiment Analysis\n${commentAnalysis.sentiment}\n\n`;

        if (commentAnalysis.keyPoints.length > 0) {
          response += `### 🔑 Key Points\n`;
          commentAnalysis.keyPoints.forEach((point) => {
            response += `- ${point}\n`;
          });
          response += `\n`;
        }

        response += `### 📍 Current Status\n${commentAnalysis.latestStatus}\n\n`;

        response += `### 📋 Recent Comments Details\n`;
        lastFiveComments.forEach((comment, index) => {
          response += `**${comment.author}** _(${formatDate(
            comment.created
          )})_:\n`;
          response += `${
            comment.text.length > 150
              ? comment.text.substring(0, 150) + "..."
              : comment.text
          }\n\n`;
        });
      } else {
        response += `**Recent Activity:**\n`;
        lastFiveComments.forEach((comment, index) => {
          response += `- **${comment.author}** (${formatDate(
            comment.created
          )}): ${comment.text.substring(0, 100)}${
            comment.text.length > 100 ? "..." : ""
          }\n`;
        });
        response += `\n`;
      }
    } else {
      response += `## 💬 Comments\nNo comments available\n\n`;
    }

    // CRITICAL FIX: Convert ticket IDs to hyperlinks in the response
    response = this.convertTicketIdsToHyperlinks(response);

    response += `---\n*Summary generated: ${new Date().toLocaleString()}*`;

    return response;
  }

  async getSentimentAnalysis(ticketId) {
    console.log(
      `[JiraAgentService] Getting sentiment analysis for ticket: ${ticketId}`
    );

    try {
      // Get ticket details
      const ticket = await jiraClient.getIssue(ticketId);

      // Get ALL comments for comprehensive sentiment analysis
      const allComments = await jiraClient.fetchAllComments(ticketId);

      if (allComments.length === 0) {
        return {
          success: true,
          formattedResponse: `# Sentiment Analysis for ${ticketId}\n\n**No comments available** - Cannot perform sentiment analysis without comments.\n\nTicket: ${
            ticket.fields?.summary || "No summary"
          }`,
          sources: [],
          issueKey: ticketId,
        };
      }

      console.log(
        `[JiraAgentService] Analyzing sentiment for ${allComments.length} comments`
      );

      // CRITICAL FIX: Enhanced sentiment analysis with Claude
      const commentsText = allComments
        .map(
          (comment, index) =>
            `[${index + 1}] ${comment.author} (${formatDate(
              comment.created
            )}): ${comment.text}`
        )
        .join("\n\n");

      const sentimentPrompt = `Perform comprehensive sentiment analysis on this Jira ticket and its comments:
  
  TICKET: ${ticketId} - ${ticket.fields?.summary || "No summary"}
  STATUS: ${ticket.fields?.status?.name || "Unknown"}
  PRIORITY: ${ticket.fields?.priority?.name || "Unknown"}
  
  COMMENTS (${allComments.length} total):
  ${commentsText.substring(0, 4000)} ${
        commentsText.length > 4000 ? "\n[... truncated for analysis ...]" : ""
      }
  
  Provide detailed analysis:
  
  1. OVERALL_SENTIMENT: (Positive/Negative/Neutral/Mixed) with confidence level
  2. SENTIMENT_TREND: How sentiment has changed over time
  3. KEY_CONCERNS: Main issues or frustrations expressed
  4. POSITIVE_ASPECTS: Any positive feedback or progress noted  
  5. EMOTIONAL_INDICATORS: Specific words/phrases showing emotion
  6. RECOMMENDATIONS: Suggested actions based on sentiment
  
  Format as structured analysis.`;

      const response = await llmGatewayService.query(sentimentPrompt, [], {
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.2,
        max_tokens: 1500,
      });

      let sentimentAnalysis = "";
      if (response?.content) {
        sentimentAnalysis = response.content;
      } else {
        sentimentAnalysis = "Sentiment analysis temporarily unavailable.";
      }

      const ticketUrl = `${process.env.JIRA_API_URL}/browse/${ticketId}`;

      let formattedResponse = `# 🎭 Sentiment Analysis Report\n\n`;
      formattedResponse += `**🎫 Ticket:** [${ticketId}](${ticketUrl})\n`;
      formattedResponse += `**📋 Summary:** ${
        ticket.fields?.summary || "No summary"
      }\n`;
      formattedResponse += `**💬 Comments Analyzed:** ${allComments.length}\n`;
      formattedResponse += `**📅 Analysis Date:** ${new Date().toLocaleDateString()}\n\n`;

      formattedResponse += `## 📊 Sentiment Analysis Results\n\n`;
      formattedResponse += sentimentAnalysis;

      formattedResponse += `\n\n---\n`;
      formattedResponse += `### 📝 Comment Timeline\n`;
      allComments.slice(0, 10).forEach((comment, index) => {
        formattedResponse += `**${index + 1}.** ${
          comment.author
        } _(${formatDate(comment.created)})_: ${comment.text.substring(
          0,
          100
        )}${comment.text.length > 100 ? "..." : ""}\n\n`;
      });

      if (allComments.length > 10) {
        formattedResponse += `_... and ${
          allComments.length - 10
        } more comments_\n`;
      }

      // Convert ticket IDs to hyperlinks
      formattedResponse = this.convertTicketIdsToHyperlinks(formattedResponse);

      return {
        success: true,
        formattedResponse: formattedResponse,
        sources: [],
        issueKey: ticketId,
        metadata: {
          commentCount: allComments.length,
          analysisDate: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error in sentiment analysis:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error performing sentiment analysis for ${ticketId}: ${error.message}`,
        sources: [],
        issueKey: ticketId,
      };
    }
  }

  /**
   * UTILITY: Format date helper
   */
  formatDate(dateStr) {
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
  }
  /**
   * CRITICAL FIX: Enhanced query processing with chat history support
   */
  async processQuery(query, chatHistory = [], options = {}) {
    console.log(`[JiraAgentService] Processing query: "${query}"`);

    try {
      // ISSUE FIX 1 & 2: Direct ticket ID detection
      const ticketMatch = query.match(/([A-Z]+-\d+)/i);
      if (ticketMatch) {
        const ticketId = ticketMatch[1].toUpperCase();
        console.log(
          `[JiraAgentService] Direct ticket query detected: ${ticketId}`
        );

        // Check if asking about timeline/resolution
        if (
          query.toLowerCase().includes("timeline") ||
          query.toLowerCase().includes("resolution")
        ) {
          return this.getTicketSummaryWithTimeline(ticketId);
        }

        // Check if asking about comments specifically
        if (
          query.toLowerCase().includes("comments") ||
          query.toLowerCase().includes("all comments")
        ) {
          return this.getTicketCommentsDetailed(ticketId);
        }

        // Default to comprehensive summary
        return this.getTicketSummary(ticketId);
      }

      // ISSUE FIX 3: Enhanced top issues detection
      if (this.isTopIssuesQuery(query)) {
        return this.processTopIssuesQuery(query);
      }

      // ISSUE FIX 4: Customer-specific ticket search
      if (this.isCustomerSpecificQuery(query)) {
        return this.processCustomerQuery(query);
      }

      // ISSUE FIX 6: Bug queries should search ZOOM project
      if (this.isBugQuery(query)) {
        return this.processBugQuery(query);
      }

      // Regular query processing
      return this.processRegularQuery(query, chatHistory);
    } catch (error) {
      console.error("[JiraAgentService] Error in processing:", error);
      return this.enhancedFallbackProcessing(query, error);
    }
  }

  async getTicketSummaryWithTimeline(ticketId) {
    console.log(`[JiraAgentService] Getting timeline summary for: ${ticketId}`);

    try {
      const ticket = await jiraClient.getIssue(ticketId);
      const allComments = await jiraClient.fetchAllComments(ticketId);

      // Get timeline-specific information
      const timelineData = {
        created: ticket.fields?.created,
        updated: ticket.fields?.updated,
        resolutionDate: ticket.fields?.resolutiondate,
        status: ticket.fields?.status?.name,
        priority: ticket.fields?.priority?.name,
        currentAssignee: ticket.fields?.assignee?.displayName || "Unassigned",
      };

      // Calculate resolution timeline if resolved
      let resolutionTimeline = "Not yet resolved";
      if (timelineData.resolutionDate && timelineData.created) {
        const created = new Date(timelineData.created);
        const resolved = new Date(timelineData.resolutionDate);
        const diffMs = resolved - created;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        resolutionTimeline = `Resolved in ${diffDays} days`;
      } else if (timelineData.created) {
        const created = new Date(timelineData.created);
        const now = new Date();
        const diffMs = now - created;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        resolutionTimeline = `Open for ${diffDays} days`;
      }

      // Use Claude for timeline-focused summary
      const timelineSummary = await this.generateTimelineSummary(
        ticket,
        allComments,
        timelineData,
        resolutionTimeline
      );

      return {
        success: true,
        formattedResponse: timelineSummary,
        sources: [],
        ticket: ticket,
        relatedQuestions: [
          `Show me all comments for ${ticketId}`,
          `What is the current status of ${ticketId}?`,
          `Who is assigned to ${ticketId}?`,
          `Find similar issues to ${ticketId}`,
        ],
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error getting timeline:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error retrieving timeline for ${ticketId}: ${error.message}`,
      };
    }
  }

  async getTicketCommentsDetailed(ticketId) {
    console.log(
      `[JiraAgentService] Getting detailed comments for: ${ticketId}`
    );

    try {
      const ticket = await jiraClient.getIssue(ticketId);
      const allComments = await jiraClient.fetchAllComments(ticketId);

      if (allComments.length === 0) {
        return {
          success: true,
          formattedResponse: `# Comments for ${ticketId}\n\n**No comments found** for this ticket.\n\n**Ticket:** ${
            ticket.fields?.summary || "No summary"
          }`,
          sources: [],
        };
      }

      // Generate detailed comments summary
      const commentsSummary = await this.generateDetailedCommentsSummary(
        ticket,
        allComments
      );

      return {
        success: true,
        formattedResponse: commentsSummary,
        sources: [],
        relatedQuestions: [
          `Analyze sentiment of comments in ${ticketId}`,
          `What are the main issues discussed in ${ticketId}?`,
          `Who are the main contributors to ${ticketId}?`,
        ],
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error getting comments:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error retrieving comments for ${ticketId}: ${error.message}`,
      };
    }
  }

  async processTopIssuesQuery(query) {
    console.log(`[JiraAgentService] Processing top issues query: "${query}"`);

    try {
      const analysis = await this.analyzeTopIssuesQuery(query);

      // Build JQL for high/highest priority tickets only
      let jqlQuery = `project = ZSEE AND priority in (Highest, High)`;

      // Add component filter if specified
      if (analysis.component) {
        jqlQuery += ` AND "issue area (component)[dropdown]" = "${analysis.component}"`;
      }

      // CRITICAL FIX: Add time constraint for "this week"
      if (analysis.timeframe === "this_week") {
        jqlQuery += ` AND created >= -7d`;
      } else if (analysis.timeframe === "last_week") {
        jqlQuery += ` AND created >= -14d AND created <= -7d`;
      }

      jqlQuery += ` ORDER BY priority DESC, created DESC`;

      console.log(`[JiraAgentService] Top issues JQL: ${jqlQuery}`);

      const issues = await jiraClient.searchIssues(jqlQuery, 20);

      if (issues.length === 0) {
        return {
          success: true,
          formattedResponse: `# Top Issues Search Results\n\nNo high or highest priority issues found for the specified criteria.\n\n**Search:** ${query}`,
          sources: [],
        };
      }

      const topIssuesResponse = await this.formatTopIssuesResponse(
        query,
        issues,
        analysis
      );

      return {
        success: true,
        formattedResponse: topIssuesResponse,
        sources: [],
        relatedQuestions: [
          "What are the trends in high priority issues?",
          "Show me resolution time for these issues",
          "Which team members are assigned to these issues?",
        ],
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error processing top issues:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error processing top issues query: ${error.message}`,
      };
    }
  }

  async processCustomerQuery(query) {
    console.log(`[JiraAgentService] Processing customer query: "${query}"`);

    try {
      const customerInfo = this.extractCustomerInfo(query);

      // Build JQL for customer-specific search
      let jqlQuery = `project in (ZSEE, ZOOM) AND priority in (Highest, High)`;

      // Add customer name search
      if (customerInfo.customerName) {
        jqlQuery += ` AND (summary ~ "${customerInfo.customerName}" OR description ~ "${customerInfo.customerName}" OR comment ~ "${customerInfo.customerName}")`;
      }

      // Add crash-specific search if mentioned
      if (query.toLowerCase().includes("crash")) {
        jqlQuery += ` AND (summary ~ "crash" OR description ~ "crash")`;
        jqlQuery += ` AND "issue area (component)[dropdown]" = "Desktop Clients"`;
      }

      // Add issue area if specified
      if (customerInfo.issueArea) {
        jqlQuery += ` AND "issue area (component)[dropdown]" = "${customerInfo.issueArea}"`;
      }

      jqlQuery += ` ORDER BY priority DESC, created DESC`;

      console.log(`[JiraAgentService] Customer query JQL: ${jqlQuery}`);

      const issues = await jiraClient.searchIssues(jqlQuery, 15);

      const customerResponse = await this.formatCustomerQueryResponse(
        query,
        issues,
        customerInfo
      );

      return {
        success: true,
        formattedResponse: customerResponse,
        sources: [],
        relatedQuestions: [
          `Show me all issues for ${customerInfo.customerName}`,
          "What is the resolution time for customer issues?",
          "Are there any patterns in customer-reported issues?",
        ],
      };
    } catch (error) {
      console.error(
        `[JiraAgentService] Error processing customer query:`,
        error
      );
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error processing customer query: ${error.message}`,
      };
    }
  }

  async processBugQuery(query) {
    console.log(`[JiraAgentService] Processing bug query: "${query}"`);

    try {
      // CRITICAL FIX: Always search ZOOM project for bugs
      let jqlQuery = `project = ZOOM AND type = Bug`;

      const analysis = await this.analyzeBugQuery(query);

      // Add component filter if specified
      if (analysis.component) {
        jqlQuery += ` AND component = "${analysis.component}"`;
      }

      // Add time constraints
      if (analysis.timeframe) {
        jqlQuery += this.getTimeframeJqlClause(analysis.timeframe);
      }

      // Add priority filter for high priority bugs
      if (
        query.toLowerCase().includes("high") ||
        query.toLowerCase().includes("critical")
      ) {
        jqlQuery += ` AND priority in (Highest, High, Critical)`;
      }

      jqlQuery += ` ORDER BY priority DESC, created DESC`;

      console.log(`[JiraAgentService] Bug query JQL: ${jqlQuery}`);

      const bugs = await jiraClient.searchIssues(jqlQuery, 20);

      const bugResponse = await this.formatBugQueryResponse(
        query,
        bugs,
        analysis
      );

      return {
        success: true,
        formattedResponse: bugResponse,
        sources: [],
        relatedQuestions: [
          "What are the most common types of bugs?",
          "Show me bug resolution trends",
          "Which components have the most bugs?",
        ],
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error processing bug query:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error processing bug query: ${error.message}`,
      };
    }
  }

  /**
   * Helper: Check if query is asking for top issues
   */
  isTopIssuesQuery(query) {
    const lowerQuery = query.toLowerCase();
    return (
      (lowerQuery.includes("top") && lowerQuery.includes("issue")) ||
      (lowerQuery.includes("high") &&
        (lowerQuery.includes("issue") || lowerQuery.includes("ticket"))) ||
      (lowerQuery.includes("highest") &&
        (lowerQuery.includes("issue") || lowerQuery.includes("ticket")))
    );
  }

  /**
   * Helper: Check if query is customer-specific
   */
  isCustomerSpecificQuery(query) {
    const lowerQuery = query.toLowerCase();
    return (
      lowerQuery.includes("customer") ||
      lowerQuery.includes("client") ||
      (lowerQuery.includes("for") && lowerQuery.includes("company"))
    );
  }

  /**
   * Helper: Check if query is about bugs
   */
  isBugQuery(query) {
    const lowerQuery = query.toLowerCase();
    return (
      lowerQuery.includes("bug") ||
      lowerQuery.includes("defect") ||
      (lowerQuery.includes("issue") &&
        (lowerQuery.includes("crash") || lowerQuery.includes("error")))
    );
  }

  /**
   * Helper: Analyze top issues query
   */
  async analyzeTopIssuesQuery(query) {
    const lowerQuery = query.toLowerCase();

    // Extract component
    let component = null;
    if (lowerQuery.includes("desktop client")) component = "Desktop Clients";
    else if (lowerQuery.includes("mobile client")) component = "Mobile Client";
    else if (lowerQuery.includes("audio")) component = "Audio";
    else if (lowerQuery.includes("video")) component = "Video";
    else if (lowerQuery.includes("zoom ai")) component = "Zoom AI";

    // Extract timeframe
    let timeframe = null;
    if (lowerQuery.includes("this week")) timeframe = "this_week";
    else if (lowerQuery.includes("last week")) timeframe = "last_week";
    else if (lowerQuery.includes("this month")) timeframe = "this_month";

    return { component, timeframe };
  }

  /**
   * Helper: Extract customer information
   */
  extractCustomerInfo(query) {
    // Extract customer name from quotes or after "for"
    const customerMatch = query.match(
      /"([^"]+)"|for\s+([A-Za-z\s]+)\s+customer/i
    );
    const customerName = customerMatch
      ? (customerMatch[1] || customerMatch[2]).trim()
      : null;

    // Extract issue area
    const lowerQuery = query.toLowerCase();
    let issueArea = null;
    if (lowerQuery.includes("desktop") || lowerQuery.includes("crash"))
      issueArea = "Desktop Clients";
    else if (lowerQuery.includes("mobile")) issueArea = "Mobile Client";
    else if (lowerQuery.includes("audio")) issueArea = "Audio";
    else if (lowerQuery.includes("video")) issueArea = "Video";

    return { customerName, issueArea };
  }
  async generateTimelineSummary(
    ticket,
    comments,
    timelineData,
    resolutionTimeline
  ) {
    const prompt = `Create a timeline-focused summary for this Jira ticket:

TICKET: ${ticket.key} - ${ticket.fields?.summary}
STATUS: ${timelineData.status}
PRIORITY: ${timelineData.priority}
CREATED: ${timelineData.created}
UPDATED: ${timelineData.updated}
RESOLUTION DATE: ${timelineData.resolutionDate || "Not resolved"}
RESOLUTION TIMELINE: ${resolutionTimeline}
CURRENT ASSIGNEE: ${timelineData.currentAssignee}

RECENT COMMENTS: ${comments
      .slice(-5)
      .map((c) => `${c.author} (${c.created}): ${c.text.substring(0, 200)}`)
      .join("\n")}

Create a summary focusing on:
1. Resolution Timeline & Status
2. Key milestones from comments
3. Current state and next steps
4. Time-based insights

Format with clear headers and bullet points.`;

    try {
      const response = await llmGatewayService.query(prompt, [], {
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.3,
        max_tokens: 1000,
      });

      return response.content || "Summary generation failed";
    } catch (error) {
      console.error("Timeline summary generation failed:", error);
      return this.createFallbackTimelineSummary(
        ticket,
        timelineData,
        resolutionTimeline
      );
    }
  }

  /**
   * Helper: Generate detailed comments summary
   */
  async generateDetailedCommentsSummary(ticket, comments) {
    let response = `# All Comments for ${ticket.key}\n\n`;
    response += `**📋 Ticket:** ${ticket.fields?.summary}\n`;
    response += `**💬 Total Comments:** ${comments.length}\n\n`;

    response += `## 📝 Comments Timeline\n\n`;

    comments.forEach((comment, index) => {
      const date = new Date(comment.created).toLocaleDateString();
      const time = new Date(comment.created).toLocaleTimeString();

      response += `### ${index + 1}. ${comment.author} - ${date} at ${time}\n`;
      response += `${comment.text}\n\n`;
      response += `---\n\n`;
    });

    return response;
  }

  /**
   * Helper: Format top issues response
   */
  async formatTopIssuesResponse(query, issues, analysis) {
    let response = `# 🎯 Top Priority Issues\n\n`;
    response += `**Query:** ${query}\n`;
    response += `**Found:** ${issues.length} high/highest priority issues\n`;
    if (analysis.component)
      response += `**Component:** ${analysis.component}\n`;
    if (analysis.timeframe)
      response += `**Timeframe:** ${analysis.timeframe.replace("_", " ")}\n`;
    response += `\n`;

    issues.forEach((issue, index) => {
      response += `## ${index + 1}. ${issue.key}: ${issue.fields?.summary}\n`;
      response += `- **Priority:** ${issue.fields?.priority?.name}\n`;
      response += `- **Status:** ${issue.fields?.status?.name}\n`;
      response += `- **Assignee:** ${
        issue.fields?.assignee?.displayName || "Unassigned"
      }\n`;
      response += `- **Created:** ${new Date(
        issue.fields?.created
      ).toLocaleDateString()}\n\n`;
    });

    return this.convertTicketIdsToHyperlinks(response);
  }

  /**
   * Helper: Format customer query response
   */
  async formatCustomerQueryResponse(query, issues, customerInfo) {
    let response = `# 🏢 Customer Issues Report\n\n`;
    response += `**Query:** ${query}\n`;
    if (customerInfo.customerName)
      response += `**Customer:** ${customerInfo.customerName}\n`;
    response += `**Found:** ${issues.length} high priority issues\n\n`;

    if (issues.length === 0) {
      response += `No high priority issues found for the specified customer and criteria.\n`;
    } else {
      issues.forEach((issue, index) => {
        response += `## ${index + 1}. ${issue.key}: ${issue.fields?.summary}\n`;
        response += `- **Priority:** ${issue.fields?.priority?.name}\n`;
        response += `- **Status:** ${issue.fields?.status?.name}\n`;
        response += `- **Project:** ${issue.key.split("-")[0]}\n`;
        response += `- **Created:** ${new Date(
          issue.fields?.created
        ).toLocaleDateString()}\n\n`;
      });
    }

    return this.convertTicketIdsToHyperlinks(response);
  }

  /**
   * Helper: Format bug query response
   */
  async formatBugQueryResponse(query, bugs, analysis) {
    let response = `# 🐛 Bug Report (ZOOM Project)\n\n`;
    response += `**Query:** ${query}\n`;
    response += `**Found:** ${bugs.length} bugs in ZOOM project\n`;
    if (analysis.component)
      response += `**Component:** ${analysis.component}\n`;
    response += `\n`;

    bugs.forEach((bug, index) => {
      response += `## ${index + 1}. ${bug.key}: ${bug.fields?.summary}\n`;
      response += `- **Priority:** ${bug.fields?.priority?.name}\n`;
      response += `- **Status:** ${bug.fields?.status?.name}\n`;
      response += `- **Assignee:** ${
        bug.fields?.assignee?.displayName || "Unassigned"
      }\n`;
      response += `- **Created:** ${new Date(
        bug.fields?.created
      ).toLocaleDateString()}\n\n`;
    });

    return this.convertTicketIdsToHyperlinks(response);
  }

  /**
   * Helper: Create fallback timeline summary
   */
  createFallbackTimelineSummary(ticket, timelineData, resolutionTimeline) {
    let response = `# 📅 Resolution Timeline for ${ticket.key}\n\n`;
    response += `**Summary:** ${ticket.fields?.summary}\n`;
    response += `**Current Status:** ${timelineData.status}\n`;
    response += `**Priority:** ${timelineData.priority}\n`;
    response += `**Resolution Timeline:** ${resolutionTimeline}\n\n`;

    response += `## Timeline Details\n`;
    response += `- **Created:** ${new Date(
      timelineData.created
    ).toLocaleString()}\n`;
    response += `- **Last Updated:** ${new Date(
      timelineData.updated
    ).toLocaleString()}\n`;
    if (timelineData.resolutionDate) {
      response += `- **Resolved:** ${new Date(
        timelineData.resolutionDate
      ).toLocaleString()}\n`;
    }
    response += `- **Current Assignee:** ${timelineData.currentAssignee}\n`;

    return response;
  }
  /**
   * CRITICAL FIX: Handle clarification responses for continued conversations
   */
  async handleClarificationResponse(
    originalQuery,
    clarificationResponse,
    chatHistory = []
  ) {
    console.log(`[JiraAgentService] Handling clarification response`);
    console.log(`[JiraAgentService] Original query: "${originalQuery}"`);
    console.log(`[JiraAgentService] Clarification: "${clarificationResponse}"`);

    // Combine original query with clarification
    const enhancedQuery = `${originalQuery} ${clarificationResponse}`;

    // Process the enhanced query
    return await this.processQuery(enhancedQuery, chatHistory);
  }

  /**
   * Check if user provided required information (Issue Area, Project Name, Engineer Name)
   */
  checkRequiredInformation(query) {
    const lowerQuery = query.toLowerCase();

    // For charts/visualizations, ALWAYS need Issue Area or Engineer Name
    const isVisualizationQuery =
      lowerQuery.includes("heatmap") ||
      lowerQuery.includes("pie chart") ||
      lowerQuery.includes("bar chart") ||
      lowerQuery.includes("chart") ||
      lowerQuery.includes("graph") ||
      lowerQuery.includes("visualization");

    // For analysis queries that need specific information
    const needsIssueArea =
      lowerQuery.includes("mttr") ||
      lowerQuery.includes("sentiment analysis") ||
      lowerQuery.includes("insights") ||
      isVisualizationQuery ||
      (lowerQuery.includes("analysis") &&
        !lowerQuery.includes("frameserverclient"));

    if (isVisualizationQuery) {
      // Charts MUST have Issue Area or Engineer Name
      const issueAreaKeywords = [
        "desktop",
        "client",
        "crash",
        "streaming",
        "pwa",
        "web client",
        "chat",
        "audio",
        "video",
        "sharing",
        "breakout",
        "join meeting",
        "whiteboard",
        "zoom node",
        "vdi",
        "mail client",
        "dashboard",
        "reports",
        "meetings",
        "webinar",
        "ai",
      ];

      const engineerKeywords = [
        "engineer",
        "assignee",
        "assigned to",
        "developer",
        "team member",
      ];

      const hasIssueArea = issueAreaKeywords.some((keyword) =>
        lowerQuery.includes(keyword)
      );
      const hasEngineer = engineerKeywords.some((keyword) =>
        lowerQuery.includes(keyword)
      );
      const hasProject =
        lowerQuery.includes("zsee") || lowerQuery.includes("project");

      if (!hasIssueArea && !hasEngineer) {
        return {
          needsClarification: true,
          message:
            "For charts and visualizations, I need either an Issue Area/Component OR Engineer Name. Please specify:",
          promptType: "visualization_data",
          metadata: {
            originalQuery: query,
            missingInfo: ["Issue Area or Engineer Name"],
            suggestions: {
              issueAreas: [
                "Desktop Clients (for crashes, client issues)",
                "Zoom AI (for AI, summaries, transcription)",
                "Web_Meetings/Webinars (for meeting/webinar issues)",
                "Web_Dashboard/Reports (for dashboard/analytics)",
                "Live Streaming",
                "PWA/WebClient",
                "Chat",
                "Audio",
                "Video",
                "Sharing",
                "Breakout",
                "Join Meeting",
                "Whiteboard - Client",
                "Zoom Node",
                "VDI",
                "Zoom Mail Client",
              ],
              engineers: [
                "John Smith",
                "Sarah Johnson",
                "Mike Chen",
                "Lisa Wang",
                "David Brown",
              ],
            },
          },
        };
      }

      if (!hasProject) {
        return {
          needsClarification: true,
          message:
            "Which project should I analyze for the chart? Please specify the project name.",
          promptType: "project_name",
          metadata: {
            originalQuery: query,
            missingInfo: ["Project Name"],
            suggestions: ["ZSEE", "ZOOM", "CLIENT"],
          },
        };
      }
    } else if (needsIssueArea) {
      // Regular analysis queries
      const issueAreaKeywords = [
        "desktop",
        "client",
        "crash",
        "streaming",
        "pwa",
        "web client",
        "chat",
        "audio",
        "video",
        "sharing",
        "breakout",
        "join meeting",
        "whiteboard",
        "zoom node",
        "vdi",
        "mail client",
        "dashboard",
        "reports",
        "meetings",
        "webinar",
        "ai",
      ];

      const hasIssueArea = issueAreaKeywords.some((keyword) =>
        lowerQuery.includes(keyword)
      );
      const hasProject =
        lowerQuery.includes("zsee") || lowerQuery.includes("project");

      if (!hasIssueArea) {
        return {
          needsClarification: true,
          message:
            "To provide accurate analysis, I need to know which Issue Area/Component you want me to analyze. Please specify:",
          promptType: "issue_area",
          metadata: {
            originalQuery: query,
            missingInfo: ["Issue Area"],
            suggestions: [
              "Desktop Clients (for crashes, client issues)",
              "Zoom AI (for AI, summaries, transcription)",
              "Web_Meetings/Webinars (for meeting/webinar issues)",
              "Web_Dashboard/Reports (for dashboard/analytics)",
              "Live Streaming",
              "PWA/WebClient",
              "Chat",
              "Audio",
              "Video",
              "Sharing",
              "Breakout",
              "Join Meeting",
              "Whiteboard - Client",
              "Zoom Node",
              "VDI",
              "Zoom Mail Client",
            ],
          },
        };
      }

      if (!hasProject) {
        return {
          needsClarification: true,
          message:
            "Which project should I analyze? Please specify the project name.",
          promptType: "project_name",
          metadata: {
            originalQuery: query,
            missingInfo: ["Project Name"],
            suggestions: ["ZSEE", "ZOOM", "CLIENT"],
          },
        };
      }
    }

    return { needsClarification: false };
  }
  async analyzeBugQuery(query) {
    const lowerQuery = query.toLowerCase();

    // Extract version information
    let version = null;
    let clientType = "Client"; // Default to Client

    const versionMatch = query.match(/(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      version = versionMatch[1];

      // Detect client type based on context
      if (
        lowerQuery.includes("vdi") ||
        lowerQuery.includes("virtual desktop")
      ) {
        clientType = "VDI";
      } else if (
        lowerQuery.includes("desktop") ||
        lowerQuery.includes("client")
      ) {
        clientType = "Client";
      }
      // You can add more client types here if needed
    }

    // Extract component/issue area for text search
    let component = null;
    let textSearch = [];

    if (
      lowerQuery.includes("desktop client") ||
      lowerQuery.includes("desktop")
    ) {
      component = "Desktop Client";
      textSearch.push("desktop");
    } else if (lowerQuery.includes("vdi")) {
      component = "VDI";
      textSearch.push("vdi");
    } else if (lowerQuery.includes("audio")) {
      component = "Audio";
      textSearch.push("audio");
    } else if (lowerQuery.includes("video")) {
      component = "Video";
      textSearch.push("video");
    } else if (lowerQuery.includes("zoom ai") || lowerQuery.includes("ai")) {
      component = "Zoom AI";
      textSearch.push("ai");
    } else if (lowerQuery.includes("mobile")) {
      component = "Mobile";
      textSearch.push("mobile");
    }

    // Extract additional search terms
    const additionalTerms = this.extractBugSearchTerms(query);
    textSearch = [...textSearch, ...additionalTerms];

    // Extract timeframe (for non-version queries)
    let timeframe = null;
    if (!version) {
      if (lowerQuery.includes("last week")) {
        timeframe = "last_week";
      } else if (lowerQuery.includes("this week")) {
        timeframe = "this_week";
      } else if (lowerQuery.includes("last month")) {
        timeframe = "last_month";
      } else if (lowerQuery.includes("this month")) {
        timeframe = "this_month";
      }
    }

    // Extract severity/priority
    let priority = "high"; // Default to high for bugs
    if (lowerQuery.includes("critical")) {
      priority = "critical";
    } else if (lowerQuery.includes("all") || lowerQuery.includes("any")) {
      priority = "all";
    }

    return {
      component,
      version,
      clientType,
      formattedVersion: version ? `${clientType} ${version}` : null,
      timeframe,
      priority,
      textSearch: textSearch.filter((term) => term && term.length > 2),
    };
  }

  /**
   * ENHANCED: Process bug query with proper version field usage
   */
  async processBugQuery(query) {
    console.log(`[JiraAgentService] Processing bug query: "${query}"`);

    try {
      const analysis = await this.analyzeBugQuery(query);
      console.log(`[JiraAgentService] Bug analysis:`, analysis);

      // CRITICAL: Always start with ZOOM project and Bug type
      let jqlQuery = `project = "ZOOM" AND type = Bug`;

      // CRITICAL: Add status filter for open bugs (To Do, In Progress)
      jqlQuery += ` AND statusCategory IN ("To Do", "In Progress")`;

      // ENHANCED: Use "found in version[dropdown]" field for version filtering
      if (analysis.formattedVersion) {
        jqlQuery += ` AND "found in version[dropdown]" = "${analysis.formattedVersion}"`;
        console.log(
          `[JiraAgentService] Using version filter: ${analysis.formattedVersion}`
        );
      }

      // Add priority filter (default to High/Highest for bugs)
      if (analysis.priority === "critical") {
        jqlQuery += ` AND priority IN (Critical, Highest)`;
      } else if (analysis.priority === "high") {
        jqlQuery += ` AND priority IN (Highest, High)`;
      } else if (analysis.priority === "all") {
        // No priority filter for "all" bugs
      } else {
        // Default to high priority
        jqlQuery += ` AND priority IN (Highest, High)`;
      }

      // ENHANCED: Add component-specific text search
      if (analysis.textSearch && analysis.textSearch.length > 0) {
        const textSearchClauses = analysis.textSearch.map(
          (term) => `text ~ "${term}"`
        );
        jqlQuery += ` AND (${textSearchClauses.join(" OR ")})`;
        console.log(
          `[JiraAgentService] Adding text search for: ${analysis.textSearch.join(
            ", "
          )}`
        );
      }

      // Add timeframe filter for non-version queries
      if (!analysis.version && analysis.timeframe) {
        jqlQuery += this.getTimeframeJqlClause(analysis.timeframe);
      }

      // Order by creation date descending (most recent first)
      jqlQuery += ` ORDER BY created DESC`;

      console.log(`[JiraAgentService] Final bug query JQL: ${jqlQuery}`);

      const bugs = await jiraClient.searchIssues(jqlQuery, 25);
      console.log(`[JiraAgentService] Found ${bugs.length} bugs`);

      const bugResponse = await this.formatBugQueryResponse(
        query,
        bugs,
        analysis
      );

      return {
        success: true,
        formattedResponse: bugResponse,
        sources: [],
        metadata: {
          queryType: "bug_search",
          project: "ZOOM",
          version: analysis.formattedVersion,
          component: analysis.component,
          bugCount: bugs.length,
          jqlQuery: jqlQuery,
          textSearch: analysis.textSearch,
        },
        relatedQuestions: this.generateBugRelatedQuestions(analysis),
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error processing bug query:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error processing bug query: ${error.message}`,
        sources: [],
      };
    }
  }

  /**
   * ENHANCED: Format bug query response with better version context
   */
  async formatBugQueryResponse(query, bugs, analysis) {
    let response = `# 🐛 Bug Report - ZOOM Project\n\n`;
    response += `**Query:** ${query}\n`;
    response += `**Project:** ZOOM\n`;
    response += `**Bug Type:** Open bugs (To Do, In Progress)\n`;

    if (analysis.formattedVersion) {
      response += `**Version:** ${analysis.formattedVersion}\n`;
    }
    if (analysis.component) {
      response += `**Component:** ${analysis.component}\n`;
    }
    if (analysis.priority !== "all") {
      response += `**Priority:** ${
        analysis.priority === "critical" ? "Critical/Highest" : "High/Highest"
      }\n`;
    }
    if (analysis.textSearch && analysis.textSearch.length > 0) {
      response += `**Search Terms:** ${analysis.textSearch.join(", ")}\n`;
    }

    response += `**Found:** ${bugs.length} bugs\n\n`;

    if (bugs.length === 0) {
      response += `## ✅ Good News!\n\n`;
      response += `No open high-priority bugs found matching your criteria.\n\n`;

      if (analysis.formattedVersion) {
        response += `**For ${analysis.formattedVersion}:**\n`;
        response += `- No high-priority bugs currently open\n`;
        response += `- This suggests good stability for this version\n\n`;
      }

      response += `**What this means:**\n`;
      response += `- ✅ No critical issues in the specified area\n`;
      response += `- ✅ Version appears stable\n`;
      response += `- ✅ Quality control is working well\n\n`;

      response += `**Want to check more?**\n`;
      response += `- Try searching for closed/resolved bugs in this version\n`;
      response += `- Check different priority levels\n`;
      response += `- Search in ZSEE project as well\n`;
    } else {
      response += `## 🚨 Active Bug Issues\n\n`;

      bugs.forEach((bug, index) => {
        response += `### ${index + 1}. ${bug.key}: ${
          bug.fields?.summary || "No summary"
        }\n`;
        response += `- **Priority:** ${
          bug.fields?.priority?.name || "Not specified"
        }\n`;
        response += `- **Status:** ${bug.fields?.status?.name || "Unknown"}\n`;
        response += `- **Assignee:** ${
          bug.fields?.assignee?.displayName || "Unassigned"
        }\n`;
        response += `- **Created:** ${new Date(
          bug.fields?.created
        ).toLocaleDateString()}\n`;

        // Show version information
        const foundInVersion = this.extractFoundInVersion(bug);
        if (foundInVersion) {
          response += `- **Found in Version:** ${foundInVersion}\n`;
        }

        // Show fix version if available
        if (bug.fields?.fixVersion && bug.fields.fixVersion.length > 0) {
          response += `- **Target Fix Version:** ${bug.fields.fixVersion
            .map((v) => v.name)
            .join(", ")}\n`;
        }

        // Show component if available
        if (bug.fields?.components && bug.fields.components.length > 0) {
          response += `- **Components:** ${bug.fields.components
            .map((c) => c.name)
            .join(", ")}\n`;
        }

        response += `\n`;
      });

      // Add summary statistics
      response += `## 📊 Bug Summary\n\n`;

      // Priority breakdown
      const priorityCounts = {};
      bugs.forEach((bug) => {
        const priority = bug.fields?.priority?.name || "Unknown";
        priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
      });

      if (Object.keys(priorityCounts).length > 1) {
        response += `**Priority Distribution:**\n`;
        Object.entries(priorityCounts)
          .sort((a, b) => {
            const priorityOrder = {
              Critical: 4,
              Highest: 3,
              High: 2,
              Medium: 1,
              Low: 0,
            };
            return (priorityOrder[b[0]] || 0) - (priorityOrder[a[0]] || 0);
          })
          .forEach(([priority, count]) => {
            response += `- ${priority}: ${count} bugs\n`;
          });
        response += `\n`;
      }

      // Status breakdown
      const statusCounts = {};
      bugs.forEach((bug) => {
        const status = bug.fields?.status?.name || "Unknown";
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });

      response += `**Status Distribution:**\n`;
      Object.entries(statusCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([status, count]) => {
          response += `- ${status}: ${count} bugs\n`;
        });

      // Show version distribution if multiple versions
      const versionCounts = {};
      bugs.forEach((bug) => {
        const version = this.extractFoundInVersion(bug) || "Unknown";
        versionCounts[version] = (versionCounts[version] || 0) + 1;
      });

      if (Object.keys(versionCounts).length > 1 || !analysis.formattedVersion) {
        response += `\n**Version Distribution:**\n`;
        Object.entries(versionCounts)
          .sort((a, b) => b[1] - a[1])
          .forEach(([version, count]) => {
            response += `- ${version}: ${count} bugs\n`;
          });
      }
    }

    return this.convertTicketIdsToHyperlinks(response);
  }

  getTimeframeJqlClause(timeframe) {
    switch (timeframe) {
      case "last_week":
        return " AND created >= -7d";
      case "this_week":
        return " AND created >= -7d";
      case "last_month":
        return " AND created >= -30d";
      case "this_month":
        return " AND created >= -30d";
      case "yesterday":
        return " AND created >= -1d AND created <= -1d";
      case "today":
        return " AND created >= 0d";
      default:
        return "";
    }
  }
  /**
   * Helper: Extract "Found in Version" field value
   */
  extractFoundInVersion(bug) {
    // Try different possible field names for "Found in Version"
    const possibleFields = [
      "found in version[dropdown]",
      "customfield_10000", // Common custom field ID
      "customfield_10001",
      "customfield_10002",
    ];

    for (const fieldName of possibleFields) {
      const fieldValue = bug.fields?.[fieldName];
      if (fieldValue) {
        if (typeof fieldValue === "string") {
          return fieldValue;
        } else if (fieldValue.value) {
          return fieldValue.value;
        } else if (fieldValue.name) {
          return fieldValue.name;
        }
      }
    }

    return null;
  }

  /**
   * Helper: Generate bug-specific related questions
   */
  generateBugRelatedQuestions(analysis) {
    const questions = [];

    if (analysis.formattedVersion) {
      questions.push(`Show me all bugs in ${analysis.formattedVersion}`);
      questions.push(
        `What are the resolved bugs in ${analysis.formattedVersion}?`
      );
    }

    if (analysis.component) {
      questions.push(`Show me all ${analysis.component} bugs this month`);
      questions.push(
        `What is the bug resolution trend for ${analysis.component}?`
      );
    } else {
      questions.push("What are the most common bug categories?");
      questions.push("Show me critical bugs across all components");
    }

    questions.push("What is the average bug resolution time?");
    questions.push("Show me bugs assigned to specific team members");

    return questions.slice(0, 4); // Limit to 4 questions
  }

  /**
   * Enhanced: Extract bug search terms (updated)
   */
  extractBugSearchTerms(query) {
    const stopWords = [
      "bug",
      "bugs",
      "issue",
      "issues",
      "after",
      "before",
      "reported",
      "any",
      "there",
      "is",
      "are",
      "in",
      "the",
      "this",
      "that",
      "version",
      "release",
      "client",
    ];

    const words = query
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .filter((word) => !stopWords.includes(word))
      .filter((word) => !/^\d+\.\d+\.\d+$/.test(word)); // Remove version numbers

    return [...new Set(words)].slice(0, 3); // Unique terms, limit to 3
  }
  /**
   * Enhanced query analysis with better keyword extraction
   */
  async enhancedQueryAnalysis(query, chatHistory = []) {
    console.log(`[JiraAgentService] Enhanced analysis for: "${query}"`);

    try {
      // Use Claude to understand time constraints and main keywords
      const analysisPrompt = `Analyze this Jira query and extract key information:
  
  Query: "${query}"
  
  Time phrase analysis:
  - "this last week", "for last week", "in last week", "past week" = past 7 days (created >= -7d)
  - "last week" alone = previous week (created >= -14d AND created <= -7d)
  - "recently", "recent" = past 7 days
  - "this week" = current week (past 7 days)
  
  Extract:
  1. Main technical keywords (like "frameserverclient", "crash", "bug")  
  2. Time constraints based on above rules
  3. Query intent (search, analysis, visualization, etc.)
  4. Issue area if mentioned (Desktop, Mobile, Web, etc.)
  
  Respond with JSON:
  {
    "mainKeywords": ["issue", "desktop", "clients"],
    "alternativeKeywords": ["desktop clients", "client issues"],
    "timeConstraint": {"type": "relative", "value": "past_week", "days": 7, "jqlClause": "created >= -7d"},
    "queryType": "top_issues",
    "issueArea": "Desktop Clients",
    "searchTerms": ["issue", "desktop", "clients"],
    "needsMultipleQueries": true
  }`;

      let response;
      try {
        response = await llmGatewayService.query(analysisPrompt, [], {
          model: "claude-3-7-sonnet-20250219",
          temperature: 0.1,
        });

        if (response?.content) {
          let cleanContent = String(response.content).trim();
          if (cleanContent.startsWith("```json")) {
            cleanContent = cleanContent
              .replace(/```json\n?/, "")
              .replace(/\n?```$/, "");
          }

          const parsed = JSON.parse(cleanContent);
          console.log(`[JiraAgentService] Claude analysis:`, parsed);

          // CRITICAL FIX: Validate and correct time constraint from Claude
          const manualTimeConstraint = this.parseTimeConstraints(query);
          if (manualTimeConstraint.jqlClause) {
            parsed.timeConstraint = manualTimeConstraint;
            console.log(
              `[JiraAgentService] Overriding Claude time constraint with manual:`,
              manualTimeConstraint
            );
          }

          return await this.enhanceAnalysisResult(parsed, query);
        }
      } catch (error) {
        console.warn(
          `[JiraAgentService] Claude analysis failed:`,
          error.message
        );
      }
    } catch (error) {
      console.error(`[JiraAgentService] Analysis error:`, error);
    }

    // Fallback to enhanced rule-based analysis
    return this.enhancedFallbackAnalysis(query);
  }

  /**
   * Enhanced fallback analysis with better keyword extraction
   */
  async enhancedFallbackAnalysis(query) {
    console.log(
      `[JiraAgentService] Enhanced fallback analysis for: "${query}"`
    );

    const lowerQuery = query.toLowerCase();

    // Extract main technical keywords with better patterns
    const technicalKeywords = this.extractTechnicalKeywords(query);
    const timeConstraint = this.parseTimeConstraints(query);
    const queryType = this.determineQueryType(query);
    const issueArea = await this.extractIssueArea(query); // Now async

    return {
      queryType: queryType,
      mainKeywords: technicalKeywords.main,
      alternativeKeywords: technicalKeywords.alternatives,
      searchTerms: technicalKeywords.all,
      timeConstraint: timeConstraint,
      issueArea: issueArea,
      needsMultipleQueries: true,
      limit: 20,
    };
  }

  /**
   * Extract technical keywords with better patterns
   */
  extractTechnicalKeywords(query) {
    // Common technical term patterns
    const technicalPatterns = [
      /frameserverclient/gi,
      /frame[_\s-]?server[_\s-]?client/gi,
      /\b[a-z]+client\b/gi,
      /\b[a-z]+server\b/gi,
      /\b[a-z]+service\b/gi,
      /\b\d+\.\d+\.\d+\b/gi, // Version numbers like 6.4.10
    ];

    const mainKeywords = [];
    const alternatives = [];

    // Extract specific technical terms
    technicalPatterns.forEach((pattern) => {
      const matches = query.match(pattern);
      if (matches) {
        matches.forEach((match) => {
          const term = match.toLowerCase();
          mainKeywords.push(term);

          // Generate alternatives
          if (term.includes("frameserverclient")) {
            alternatives.push(
              "frame server client",
              "frame-server-client",
              "frameserver client"
            );
          }
          if (term.includes("client")) {
            alternatives.push(term.replace("client", " client"));
          }
        });
      }
    });

    // Extract general keywords
    const generalKeywords = [
      "crash",
      "bug",
      "error",
      "issue",
      "problem",
      "failure",
      "exception",
    ];
    generalKeywords.forEach((keyword) => {
      if (query.toLowerCase().includes(keyword)) {
        mainKeywords.push(keyword);
      }
    });

    // Combine all unique keywords
    const allKeywords = [...new Set([...mainKeywords, ...alternatives])];

    return {
      main: mainKeywords,
      alternatives: alternatives,
      all: allKeywords,
    };
  }

  /**
   * CRITICAL FIX: Parse time constraints with correct logic
   */
  parseTimeConstraints(query) {
    const lowerQuery = query.toLowerCase();

    console.log(`[JiraAgentService] Parsing time constraints for: "${query}"`);

    // CRITICAL FIX: Handle all variations of "last week" properly
    if (
      lowerQuery.includes("this last week") ||
      lowerQuery.includes("for last week") ||
      lowerQuery.includes("in last week") ||
      lowerQuery.includes("past week") ||
      lowerQuery.includes("last 7 days")
    ) {
      // All these mean "past 7 days from now"
      console.log(
        `[JiraAgentService] Detected "past week" pattern - using created >= -7d`
      );
      return {
        type: "relative",
        value: "past_week",
        days: 7,
        jqlClause: "created >= -7d",
      };
    }

    if (
      lowerQuery.includes("last week") &&
      !lowerQuery.includes("this last week") &&
      !lowerQuery.includes("for last week") &&
      !lowerQuery.includes("in last week")
    ) {
      // Only "last week" by itself means "previous week" (7-14 days ago)
      console.log(
        `[JiraAgentService] Detected "previous week" pattern - using created >= -14d AND created <= -7d`
      );
      return {
        type: "relative",
        value: "last_week",
        days: 7,
        jqlClause: "created >= -14d AND created <= -7d",
      };
    }

    if (lowerQuery.includes("recently") || lowerQuery.includes("recent")) {
      console.log(
        `[JiraAgentService] Detected "recent" pattern - using created >= -7d`
      );
      return {
        type: "relative",
        value: "recently",
        days: 7,
        jqlClause: "created >= -7d",
      };
    }

    if (lowerQuery.includes("this week")) {
      console.log(
        `[JiraAgentService] Detected "this week" pattern - using created >= -7d`
      );
      return {
        type: "relative",
        value: "this_week",
        days: 7,
        jqlClause: "created >= -7d",
      };
    }

    if (lowerQuery.includes("this month")) {
      console.log(
        `[JiraAgentService] Detected "this month" pattern - using created >= -30d`
      );
      return {
        type: "relative",
        value: "this_month",
        days: 30,
        jqlClause: "created >= -30d",
      };
    }

    if (lowerQuery.includes("last month")) {
      console.log(
        `[JiraAgentService] Detected "last month" pattern - using created >= -60d AND created <= -30d`
      );
      return {
        type: "relative",
        value: "last_month",
        days: 30,
        jqlClause: "created >= -60d AND created <= -30d",
      };
    }

    // Version-based time constraints
    const versionMatch = query.match(/(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      console.log(
        `[JiraAgentService] Detected version pattern - using created >= -90d`
      );
      return {
        type: "version",
        value: `after_${versionMatch[1]}`,
        days: 90,
        jqlClause: `created >= -90d`,
      };
    }

    console.log(`[JiraAgentService] No specific time constraint detected`);
    return { type: "none", value: "", days: 7, jqlClause: "" };
  }

  /**
   * Determine query type based on intent
   */
  determineQueryType(query) {
    const lowerQuery = query.toLowerCase();

    if (
      lowerQuery.includes("sentiment analysis") ||
      lowerQuery.includes("sentiment")
    ) {
      return "sentiment_analysis";
    }
    if (lowerQuery.includes("mttr")) {
      return "mttr_analysis";
    }
    if (
      lowerQuery.includes("pie chart") ||
      lowerQuery.includes("chart") ||
      lowerQuery.includes("visualization")
    ) {
      return "create_chart";
    }
    if (lowerQuery.includes("summarize") || lowerQuery.includes("summary")) {
      return "summarize_ticket";
    }
    if (
      lowerQuery.includes("top") &&
      (lowerQuery.includes("issue") || lowerQuery.includes("priority"))
    ) {
      return "top_issues";
    }

    return "general_search";
  }

  /**
   * CRITICAL FIX: Extract issue area with proper component mapping
   */
  async extractIssueArea(query) {
    console.log(`[JiraAgentService] Extracting issue area from: "${query}"`);

    const lowerQuery = query.toLowerCase();

    // CRITICAL FIX: Priority keywords - these take precedence over everything else
    const priorityKeywords = {
      // Crash always goes to Desktop Clients
      crash: "Desktop Clients",
      crashes: "Desktop Clients",
      crashed: "Desktop Clients",
      crashing: "Desktop Clients",

      // AI related always goes to Zoom AI
      ai: "Zoom AI",
      "artificial intelligence": "Zoom AI",
      "zoom ai": "Zoom AI",
      "ai summary": "Zoom AI",
      "ai summaries": "Zoom AI",
      "ai transcription": "Zoom AI",
      "ai meeting": "Zoom AI",
      "smart summary": "Zoom AI",
      "meeting summary": "Zoom AI",
    };

    // Check priority keywords first
    for (const [keyword, component] of Object.entries(priorityKeywords)) {
      if (lowerQuery.includes(keyword)) {
        console.log(
          `[JiraAgentService] Found PRIORITY match: "${keyword}" -> "${component}"`
        );
        return {
          component: component,
          matchType: "priority",
          matchedKeyword: keyword,
        };
      }
    }

    // ENHANCED: Context-aware mapping - consider the full context of the question
    const contextMappings = [
      {
        patterns: [
          "language",
          "spoken",
          "meeting",
          "webinar",
          "transcription",
          "recording",
        ],
        keywords: ["summary", "ai", "language", "transcription"],
        component: "Web_Meetings/Webinars",
        description: "AI/Language issues in meetings/webinars",
      },
      {
        patterns: ["dashboard", "reports", "analytics", "statistics"],
        keywords: ["crash", "issue", "error"],
        component: "Web_Dashboard/Reports",
        description: "Issues in dashboard/reports",
      },
      {
        patterns: [
          "frameserverclient",
          "frame server",
          "client crash",
          "desktop crash",
        ],
        keywords: ["crash", "error", "issue"],
        component: "Desktop Clients",
        description: "Desktop client crashes",
      },
      {
        patterns: ["zoom ai", "ai feature", "smart", "intelligent"],
        keywords: ["summary", "transcription", "language", "translation"],
        component: "Zoom AI",
        description: "AI-related features",
      },
    ];

    // Check context-aware mappings
    for (const mapping of contextMappings) {
      const hasPattern = mapping.patterns.some((pattern) =>
        lowerQuery.includes(pattern)
      );
      const hasKeyword = mapping.keywords.some((keyword) =>
        lowerQuery.includes(keyword)
      );

      if (hasPattern && hasKeyword) {
        console.log(
          `[JiraAgentService] Found CONTEXT match: "${mapping.component}" - ${mapping.description}`
        );
        return {
          component: mapping.component,
          matchType: "context",
          matchedKeyword: `${mapping.patterns[0]}+${mapping.keywords[0]}`,
        };
      }
    }

    // ENHANCED: Standard Issue Area components mapping with better logic
    const issueAreaMapping = {
      // Desktop/Client related
      desktop: "Desktop Clients",
      "desktop client": "Desktop Clients",
      "desktop clients": "Desktop Clients",
      client: "Desktop Clients",
      clients: "Desktop Clients",
      frameserverclient: "Desktop Clients",
      "frame server client": "Desktop Clients",

      // Streaming related
      streaming: "Live Streaming",
      "live streaming": "Live Streaming",
      stream: "Live Streaming",

      // Web Client related
      pwa: "PWA/WebClient",
      "web client": "PWA/WebClient",
      webclient: "PWA/WebClient",

      // Communication features
      chat: "Chat",
      messaging: "Chat",
      message: "Chat",

      audio: "Audio",
      sound: "Audio",
      mic: "Audio",
      microphone: "Audio",
      speaker: "Audio",

      video: "Video",
      camera: "Video",
      webcam: "Video",

      sharing: "Sharing",
      "screen share": "Sharing",
      "screen sharing": "Sharing",
      "share screen": "Sharing",

      breakout: "Breakout",
      "breakout room": "Breakout",
      "breakout rooms": "Breakout",

      join: "Join Meeting",
      "join meeting": "Join Meeting",
      joining: "Join Meeting",

      whiteboard: "Whiteboard - Client",
      "white board": "Whiteboard - Client",

      node: "Zoom Node",
      "zoom node": "Zoom Node",

      vdi: "VDI",
      "virtual desktop": "VDI",

      mail: "Zoom Mail Client",
      "zoom mail": "Zoom Mail Client",
      "mail client": "Zoom Mail Client",

      // Web-based features
      dashboard: "Web_Dashboard/Reports",
      reports: "Web_Dashboard/Reports",
      report: "Web_Dashboard/Reports",
      "web dashboard": "Web_Dashboard/Reports",

      meetings: "Web_Meetings/Webinars",
      webinar: "Web_Meetings/Webinars",
      webinars: "Web_Meetings/Webinars",
      meeting: "Web_Meetings/Webinars",
      "zoom meeting": "Web_Meetings/Webinars",
    };

    // Direct keyword matching (but lower priority than context)
    for (const [keyword, component] of Object.entries(issueAreaMapping)) {
      if (lowerQuery.includes(keyword)) {
        console.log(
          `[JiraAgentService] Found STANDARD match: "${keyword}" -> "${component}"`
        );
        return {
          component: component,
          matchType: "standard",
          matchedKeyword: keyword,
        };
      }
    }

    // ENHANCED: Smart matching using Claude for complex queries
    try {
      const componentList = [
        "Desktop Clients", // For crashes, frame server issues
        "Zoom AI", // For AI, summaries, transcription
        "Web_Meetings/Webinars", // For meeting/webinar issues
        "Web_Dashboard/Reports", // For dashboard/analytics issues
        "Live Streaming",
        "PWA/WebClient",
        "Chat",
        "Audio",
        "Video",
        "Sharing",
        "Breakout",
        "Join Meeting",
        "Whiteboard - Client",
        "Zoom Node",
        "VDI",
        "Zoom Mail Client",
      ];

      const matchingPrompt = `Analyze this Jira query and match it to the most appropriate Zoom component:
  
  Query: "${query}"
  
  Available components:
  ${componentList.map((c, i) => `${i + 1}. ${c}`).join("\n")}
  
  Rules:
  - "crash" or "crashes" or client errors -> Desktop Clients
  - "AI" or "summary" or "transcription" or "language" -> Zoom AI  
  - "meeting" + "language" or "webinar" + "summary" -> Web_Meetings/Webinars
  - "dashboard" or "reports" + "crash" -> Web_Dashboard/Reports
  - "frameserverclient" or desktop issues -> Desktop Clients
  - audio/sound/mic issues -> Audio  
  - video/camera issues -> Video
  - sharing/screen share -> Sharing
  - chat/messaging -> Chat
  
  Context is important: 
  - If question mentions AI features in meetings -> Web_Meetings/Webinars
  - If question mentions crashes without specific context -> Desktop Clients
  - If question mentions reports/analytics -> Web_Dashboard/Reports
  
  Respond with only the component name or "none":`;

      const response = await llmGatewayService.query(matchingPrompt, [], {
        model: "claude-3-7-sonnet-20250219",
        temperature: 0.1,
      });

      if (response?.content) {
        const matchedComponent = response.content.trim();
        if (
          matchedComponent !== "none" &&
          componentList.includes(matchedComponent)
        ) {
          console.log(
            `[JiraAgentService] Claude matched: "${matchedComponent}"`
          );
          return {
            component: matchedComponent,
            matchType: "claude",
            matchedKeyword: "smart_match",
          };
        }
      }
    } catch (error) {
      console.warn(
        `[JiraAgentService] Claude component matching failed:`,
        error
      );
    }

    // FALLBACK: Only if no clear match found, try to fetch from Jira
    try {
      const availableComponents = await this.fetchAvailableComponents();
      if (availableComponents.length > 0) {
        // Simple keyword matching against actual Jira components
        for (const component of availableComponents) {
          const componentLower = component.name.toLowerCase();
          const queryWords = lowerQuery.split(/\s+/);

          for (const word of queryWords) {
            if (word.length > 3 && componentLower.includes(word)) {
              console.log(
                `[JiraAgentService] Matched available component: "${component.name}"`
              );
              return {
                component: component.name,
                matchType: "jira_api",
                matchedKeyword: word,
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn(
        `[JiraAgentService] Could not fetch Jira components:`,
        error
      );
    }

    // CRITICAL FIX: Return null instead of random component
    console.log(
      `[JiraAgentService] No specific component match found for query: "${query}"`
    );
    return null;
  }

  /**
   * Fetch available components from Jira
   */
  async fetchAvailableComponents() {
    try {
      console.log(`[JiraAgentService] Fetching available components from Jira`);

      // Use search API to get component information
      const response = await jiraClient.searchIssues(
        "project = ZSEE AND component is not EMPTY",
        50
      );

      const componentSet = new Set();
      response.forEach((issue) => {
        if (issue.fields?.components) {
          issue.fields.components.forEach((comp) => {
            if (comp.name) {
              componentSet.add(comp.name);
            }
          });
        }
      });

      const components = Array.from(componentSet).map((name) => ({ name }));
      console.log(
        `[JiraAgentService] Found ${components.length} components in Jira`
      );
      return components;
    } catch (error) {
      console.error(`[JiraAgentService] Error fetching components:`, error);
      return [];
    }
  }

  /**
   * CRITICAL FIX: Generate multiple JQL queries with correct time constraints
   */
  async generateMultipleJQLQueries(analysis) {
    console.log(
      `[JiraAgentService] Generating multiple JQL queries for:`,
      analysis
    );

    const queries = [];
    const baseProject = "project = ZSEE";

    // Direct ticket query if ticket ID found
    const ticketMatch = analysis.mainKeywords?.find((k) =>
      k.match(/[A-Z]+-\d+/)
    );
    if (ticketMatch) {
      queries.push({
        name: "direct_ticket",
        jql: `key = ${ticketMatch}`,
        maxResults: 1,
        purpose: `Direct ticket lookup for ${ticketMatch}`,
      });
      return queries;
    }

    // CRITICAL FIX: Build time constraint using validated JQL clause
    let timeClause = "";
    if (analysis.timeConstraint?.jqlClause) {
      timeClause = analysis.timeConstraint.jqlClause;
      console.log(`[JiraAgentService] Using time constraint: ${timeClause}`);
    }

    // Build component clause with correct field name
    let componentClause = "";
    if (analysis.issueArea?.component) {
      componentClause = `"issue area (component)[dropdown]" = "${analysis.issueArea.component}"`;
      console.log(
        `[JiraAgentService] Adding component filter: ${componentClause}`
      );
    }

    // Build priority clause for "top issues" queries
    let priorityClause = "";
    if (analysis.queryType === "top_issues") {
      priorityClause = `priority in (Highest, High)`;
      console.log(
        `[JiraAgentService] Adding priority filter for top issues: ${priorityClause}`
      );
    }

    // Query 1: Component + Time + Priority (most important for top issues)
    if (analysis.issueArea?.component) {
      let jqlParts = [baseProject, componentClause];
      if (timeClause) jqlParts.push(timeClause);
      if (priorityClause) jqlParts.push(priorityClause);

      const orderBy = "ORDER BY priority DESC, created DESC";

      queries.push({
        name: "component_time_priority",
        jql: jqlParts.join(" AND ") + " " + orderBy,
        maxResults: 20,
        purpose: `Primary search: ${analysis.issueArea.component} with time and priority filters`,
      });
    }

    // Query 2: Broader search without strict priority filter (in case no high priority issues)
    if (analysis.issueArea?.component) {
      let jqlParts = [baseProject, componentClause];
      if (timeClause) jqlParts.push(timeClause);

      queries.push({
        name: "component_time_all_priorities",
        jql: jqlParts.join(" AND ") + " ORDER BY priority DESC, created DESC",
        maxResults: 15,
        purpose: `Broader search: ${analysis.issueArea.component} with all priorities`,
      });
    }

    // Query 3: With optional text search for relevance
    if (analysis.mainKeywords?.length > 0 && analysis.issueArea?.component) {
      const mainTerms = analysis.mainKeywords
        .filter((k) => k !== "issue")
        .join(" ");
      if (mainTerms) {
        let jqlParts = [baseProject, componentClause];
        if (timeClause) jqlParts.push(timeClause);
        if (priorityClause) jqlParts.push(priorityClause);
        jqlParts.push(`(text ~ "${mainTerms}" OR summary ~ "${mainTerms}")`);

        queries.push({
          name: "component_time_priority_text",
          jql: jqlParts.join(" AND ") + " ORDER BY priority DESC, created DESC",
          maxResults: 10,
          purpose: `Text relevance search: ${mainTerms} in ${analysis.issueArea.component}`,
        });
      }
    }

    console.log(
      `[JiraAgentService] Generated ${queries.length} JQL queries:`,
      queries.map((q) => ({ name: q.name, jql: q.jql }))
    );

    return queries.length > 0 ? queries : this.generateFallbackJQL(analysis);
  }

  /**
   * Generate fallback JQL
   */
  generateFallbackJQL(analysis) {
    const baseProject = "project = ZSEE";

    return [
      {
        name: "fallback",
        jql: `${baseProject} AND text ~ "${
          analysis.searchTerms?.join(" ") || "issue"
        }" ORDER BY created DESC`,
        maxResults: 20,
        purpose: "Fallback search query",
      },
    ];
  }

  /**
   * Execute multiple JQL queries concurrently
   */
  async executeMultipleQueries(jqlQueries) {
    console.log(
      `[JiraAgentService] Executing ${jqlQueries.length} JQL queries`
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
   * Process results based on query intent
   */
  async processResultsByIntent(originalQuery, analysis, jiraResults) {
    const startTime = Date.now();
    const allIssues = this.combineAndDeduplicateResults(jiraResults);

    console.log(
      `[JiraAgentService] Processing ${allIssues.length} issues for intent: ${analysis.queryType}`
    );

    let result;

    switch (analysis.queryType) {
      case "sentiment_analysis":
        result = await this.processSentimentAnalysis(
          originalQuery,
          allIssues,
          analysis
        );
        break;
      case "mttr_analysis":
        result = await this.processMTTRAnalysis(
          originalQuery,
          allIssues,
          analysis
        );
        break;
      case "create_chart":
        result = await this.processChartCreation(
          originalQuery,
          allIssues,
          analysis
        );
        break;
      case "summarize_ticket":
        if (analysis.ticketId) {
          const ticketSummary = await this.getTicketSummary(analysis.ticketId);
          result = {
            response: ticketSummary.formattedResponse,
            sources: [],
            visualization: null,
            relatedQuestions: ticketSummary.relatedQuestions,
          };
        } else {
          result = await this.processGeneralSearch(
            originalQuery,
            allIssues,
            analysis
          );
        }
        break;
      default:
        result = await this.processGeneralSearch(
          originalQuery,
          allIssues,
          analysis
        );
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * ENHANCED: Process sentiment analysis with proper hyperlinks
   */
  async processSentimentAnalysis(query, allIssues, analysis) {
    console.log(
      `[JiraAgentService] Processing sentiment analysis for ${allIssues.length} issues`
    );

    if (allIssues.length === 0) {
      return {
        response: `No issues found for sentiment analysis based on query: "${query}"`,
        sources: [],
        visualization: null,
        relatedQuestions: [
          "Try searching with different keywords",
          "Check recent issues in the project",
        ],
      };
    }

    // Get comments for top 5 issues for sentiment analysis
    const issuesWithComments = await Promise.all(
      allIssues.slice(0, 5).map(async (issue) => {
        try {
          const comments = await jiraClient.fetchAllComments(issue.key);
          return { ...issue, comments: comments.slice(0, 5) };
        } catch (error) {
          console.error(`Error fetching comments for ${issue.key}:`, error);
          return { ...issue, comments: [] };
        }
      })
    );

    // Analyze sentiment using Claude
    let sentimentAnalysis = "";
    try {
      const commentsText = issuesWithComments
        .map((issue) => issue.comments.map((c) => c.text).join(" "))
        .join(" ");

      if (commentsText.length > 0) {
        const sentimentPrompt = `Analyze the sentiment of these Jira comments and provide insights:
  
  Comments: "${commentsText.substring(0, 2000)}"
  
  Provide:
  1. Overall sentiment (Positive/Negative/Neutral)
  2. Key concerns mentioned
  3. Common themes
  4. Recommendations for improvement
  
  Format as a brief summary.`;

        const response = await llmGatewayService.query(sentimentPrompt, [], {
          model: "claude-3-7-sonnet-20250219",
          temperature: 0.3,
        });

        if (response?.content) {
          sentimentAnalysis = response.content;
        }
      }
    } catch (error) {
      console.warn("Sentiment analysis failed, using fallback:", error);
      sentimentAnalysis =
        "Sentiment analysis unavailable - using basic summary";
    }

    let response = `# Sentiment Analysis Results\n\n`;
    response += `**Query:** "${query}"\n`;
    response += `**Issues Analyzed:** ${allIssues.length}\n`;
    response += `**Comments Analyzed:** ${issuesWithComments.reduce(
      (sum, issue) => sum + issue.comments.length,
      0
    )}\n\n`;

    if (sentimentAnalysis) {
      response += `## 🎭 Sentiment Analysis\n${sentimentAnalysis}\n\n`;
    }

    response += `## 📊 Issue Breakdown\n`;
    issuesWithComments.forEach((issue, index) => {
      // CRITICAL FIX: No separate ticket link - just show ticket ID
      response += `${index + 1}. ${issue.key}: ${issue.fields?.summary}\n`;
      response += `   - Status: ${issue.fields?.status?.name}\n`;
      response += `   - Comments: ${issue.comments.length}\n\n`;
    });

    // CRITICAL FIX: Convert ticket IDs to hyperlinks
    response = this.convertTicketIdsToHyperlinks(response);

    return {
      response: response,
      sources: [],
      visualization: null,
      relatedQuestions: [
        "Show me details of the most negative sentiment issues",
        "What are the common themes in user complaints?",
        "How can we improve user satisfaction?",
      ],
    };
  }

  /**
   * ENHANCED: Process MTTR analysis with proper hyperlinks
   */
  async processMTTRAnalysis(query, allIssues, analysis) {
    console.log(
      `[JiraAgentService] Processing MTTR analysis for ${allIssues.length} issues`
    );

    // Filter resolved issues only
    const resolvedIssues = allIssues.filter(
      (issue) => issue.fields?.resolutiondate && issue.fields?.created
    );

    if (resolvedIssues.length === 0) {
      return {
        response: `No resolved issues found for MTTR analysis based on query: "${query}".\n\nMTTR (Mean Time To Resolution) requires issues with resolution dates.`,
        sources: [],
        visualization: null,
        relatedQuestions: [
          "Show me open issues instead",
          "What are the oldest unresolved issues?",
        ],
      };
    }

    // Calculate MTTR
    let totalResolutionTime = 0;
    const issueDetails = [];

    resolvedIssues.forEach((issue) => {
      const created = new Date(issue.fields.created);
      const resolved = new Date(issue.fields.resolutiondate);
      const resolutionTime = resolved - created;

      totalResolutionTime += resolutionTime;
      issueDetails.push({
        key: issue.key,
        summary: issue.fields.summary,
        resolutionTime: resolutionTime,
        resolutionDays: Math.ceil(resolutionTime / (1000 * 60 * 60 * 24)),
      });
    });

    const avgResolutionTime = totalResolutionTime / resolvedIssues.length;
    const avgDays = Math.ceil(avgResolutionTime / (1000 * 60 * 60 * 24));
    const avgHours = Math.ceil(avgResolutionTime / (1000 * 60 * 60));

    // Sort by resolution time
    issueDetails.sort((a, b) => b.resolutionTime - a.resolutionTime);

    let response = `# MTTR Analysis Results\n\n`;
    response += `**Query:** "${query}"\n`;
    response += `**Resolved Issues Analyzed:** ${resolvedIssues.length}\n\n`;

    response += `## ⏱️ Mean Time To Resolution (MTTR)\n`;
    response += `**${avgDays} days** (${avgHours} hours)\n\n`;

    response += `## 📊 Resolution Time Breakdown\n`;
    response += `- **Fastest Resolution:** ${
      issueDetails[issueDetails.length - 1]?.resolutionDays
    } days\n`;
    response += `- **Slowest Resolution:** ${issueDetails[0]?.resolutionDays} days\n`;
    response += `- **Median Resolution:** ${
      issueDetails[Math.floor(issueDetails.length / 2)]?.resolutionDays
    } days\n\n`;

    response += `## 🎯 Top Issues by Resolution Time\n`;
    issueDetails.slice(0, 5).forEach((issue, index) => {
      // CRITICAL FIX: No separate ticket link - just show ticket ID
      response += `${index + 1}. ${issue.key}: ${issue.summary}\n`;
      response += `   - Resolution Time: ${issue.resolutionDays} days\n\n`;
    });

    // CRITICAL FIX: Convert ticket IDs to hyperlinks
    response = this.convertTicketIdsToHyperlinks(response);

    return {
      response: response,
      sources: [],
      visualization: null,
      relatedQuestions: [
        "What factors contribute to longer resolution times?",
        "Show me issues that took longer than average to resolve",
        "How can we improve our resolution time?",
      ],
    };
  }

  /**
   * Process chart creation
   */
  async processChartCreation(query, allIssues, analysis) {
    console.log(
      `[JiraAgentService] Processing chart creation for ${allIssues.length} issues`
    );

    if (allIssues.length === 0) {
      return {
        response: `No issues found to create chart for query: "${query}"`,
        sources: [],
        visualization: null,
        relatedQuestions: [
          "Try searching with broader terms",
          "Check if the project exists",
        ],
      };
    }

    // Count issues by status
    const statusCounts = {};
    const priorityCounts = {};

    allIssues.forEach((issue) => {
      const status = issue.fields?.status?.name || "Unknown";
      const priority = issue.fields?.priority?.name || "None";

      statusCounts[status] = (statusCounts[status] || 0) + 1;
      priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
    });

    let response = `# Chart: Issue Distribution\n\n`;
    response += `**Query:** "${query}"\n`;
    response += `**Total Issues:** ${allIssues.length}\n\n`;

    response += `## 📊 Issues by Status\n`;
    Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([status, count]) => {
        const percentage = ((count / allIssues.length) * 100).toFixed(1);
        response += `- **${status}:** ${count} issues (${percentage}%)\n`;
      });

    response += `\n## 🎯 Issues by Priority\n`;
    Object.entries(priorityCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([priority, count]) => {
        const percentage = ((count / allIssues.length) * 100).toFixed(1);
        response += `- **${priority}:** ${count} issues (${percentage}%)\n`;
      });

    return {
      response: response,
      sources: [],
      visualization: null,
      relatedQuestions: [
        "Show me details of the highest priority issues",
        "What are the trends over time?",
        "Create a report for management",
      ],
    };
  }
  /**
   * CRITICAL FIX: Convert ticket IDs to hyperlinks in response text
   */
  convertTicketIdsToHyperlinks(text) {
    if (!text || typeof text !== "string") return text;

    // Pattern to match Jira ticket IDs (like ZSEE-123456)
    const jiraTicketPattern = /\b([A-Z]+-\d+)\b/g;
    const jiraBaseUrl =
      process.env.JIRA_API_URL || "https://your-jira-instance.atlassian.net";

    // Replace ticket IDs with clickable hyperlinks that open in new tab
    return text.replace(jiraTicketPattern, (match, ticketId) => {
      const ticketUrl = `${jiraBaseUrl}/browse/${ticketId}`;
      return `<a href="${ticketUrl}" target="_blank" rel="noopener noreferrer" style="color: #0052cc; text-decoration: underline; font-weight: 500;">${ticketId}</a>`;
    });
  }
  /**
   * ENHANCED: Process general search with proper hyperlinks
   */
  async processGeneralSearch(query, allIssues, analysis) {
    if (allIssues.length === 0) {
      return {
        response: `Search Results\n\nFound 0 issues matching your query: "${query}"\n\n*Note: This is a basic search due to system limitations. Advanced analysis unavailable.*`,
        sources: [],
        visualization: null,
        relatedQuestions: [
          "Try different keywords",
          "Check the project name",
          "Broaden your search terms",
        ],
      };
    }

    let response = `# Search Results for "${query}"\n\n`;
    response += `Found ${allIssues.length} matching issues:\n\n`;

    allIssues.slice(0, 10).forEach((issue, index) => {
      // CRITICAL FIX: No separate ticket link - just show ticket ID which will be hyperlinked
      response += `## ${index + 1}. ${issue.key}: ${
        issue.fields?.summary || "No summary"
      }\n`;
      response += `- **Status:** ${issue.fields?.status?.name || "Unknown"}\n`;
      response += `- **Priority:** ${
        issue.fields?.priority?.name || "Not specified"
      }\n`;
      response += `- **Assignee:** ${
        issue.fields?.assignee?.displayName || "Unassigned"
      }\n`;
      response += `- **Created:** ${new Date(
        issue.fields?.created
      ).toLocaleDateString()}\n\n`;
    });

    if (allIssues.length > 10) {
      response += `*Showing top 10 of ${allIssues.length} results*\n\n`;
    }

    // CRITICAL FIX: Convert ticket IDs to hyperlinks
    response = this.convertTicketIdsToHyperlinks(response);

    return {
      response: response,
      sources: [],
      visualization: null,
      relatedQuestions: [
        "Show me more details on these issues",
        "Group these issues by component",
        "What are the common patterns?",
      ],
    };
  }

  /**
   * Create ticket summary with proper comment summarization
   */
  async createTicketSummaryWithCommentSummary(ticket, lastFiveComments) {
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

    // Create proper comment summary using Claude
    let commentSummary = "";
    if (lastFiveComments.length > 0) {
      try {
        const commentsText = lastFiveComments
          .map((comment) => `${comment.author}: ${comment.text}`)
          .join("\n\n");

        const summaryPrompt = `Summarize these Jira ticket comments in 2-3 sentences, focusing on key points, decisions, and current status:

Comments:
${commentsText}

Provide a concise summary highlighting:
1. Main issues discussed
2. Decisions made
3. Current status/next steps`;

        const response = await llmGatewayService.query(summaryPrompt, [], {
          model: "claude-3-7-sonnet-20250219",
          temperature: 0.3,
        });

        if (response?.content) {
          commentSummary = response.content;
        }
      } catch (error) {
        console.warn("Comment summarization failed:", error);
        commentSummary =
          "Unable to generate comment summary - showing recent activity instead";
      }
    }

    const ticketLink = `[${ticket.key}](${process.env.JIRA_API_URL}/browse/${ticket.key})`;

    let response = `# Jira Ticket Summary\n\n`;
    response += `🆔 **Ticket:** ${ticketLink}\n`;
    response += `📋 **Summary:** ${
      ticket.fields?.summary || "No summary available"
    }\n`;
    response += `🎯 **Priority:** ${
      ticket.fields?.priority?.name || "Not specified"
    }\n`;
    response += `🛠 **Status:** ${ticket.fields?.status?.name}\n`;
    response += `👤 **Assignee:** ${
      ticket.fields?.assignee?.displayName || "Unassigned"
    }\n`;
    response += `👥 **Reporter:** ${
      ticket.fields?.reporter?.displayName || "Not specified"
    }\n\n`;

    response += `## 📅 Timeline\n`;
    response += `- **Created:** ${formatDate(ticket.fields?.created)}\n`;
    response += `- **Updated:** ${formatDate(ticket.fields?.updated)}\n\n`;

    response += `## 🔍 Issue Description\n`;
    response += `${
      this.extractTextFromDescription(ticket.fields?.description) ||
      "No description available"
    }\n\n`;

    if (lastFiveComments.length > 0) {
      response += `## 💬 Comment Summary (${lastFiveComments.length} recent comments)\n`;
      if (
        commentSummary &&
        commentSummary !==
          "Unable to generate comment summary - showing recent activity instead"
      ) {
        response += `${commentSummary}\n\n`;
      } else {
        response += `**Recent Activity:**\n`;
        lastFiveComments.forEach((comment, index) => {
          const commentDate = new Date(comment.created).toLocaleDateString();
          response += `- **${
            comment.author
          }** (${commentDate}): ${comment.text.substring(0, 100)}${
            comment.text.length > 100 ? "..." : ""
          }\n`;
        });
        response += `\n`;
      }
    } else {
      response += `## 💬 Comments\nNo comments available\n\n`;
    }

    response += `*Summary generated: ${new Date().toLocaleString()}*`;

    return response;
  }

  /**
   * Extract text from description
   */
  extractTextFromDescription(description) {
    if (!description) return "";

    if (typeof description === "string") {
      return description.length > 500
        ? description.substring(0, 500) + "..."
        : description;
    }

    try {
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
      console.warn("Error extracting description text:", error);
    }

    return "Description format not supported";
  }

  /**
   * Combine and deduplicate results
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

  /**
   * Enhanced fallback processing
   */
  async enhancedFallbackProcessing(query, originalError) {
    console.log(
      `[JiraAgentService] Enhanced fallback processing for: "${query}"`
    );

    // Basic search as last resort
    try {
      const searchTerms = query
        .toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((term) => term.length > 2)
        .slice(0, 3);

      const jql = `project = ZSEE AND text ~ "${searchTerms.join(
        " "
      )}" ORDER BY created DESC`;
      const issues = await jiraClient.searchIssues(jql, 10);

      const response = await this.processGeneralSearch(query, issues, {
        queryType: "general_search",
        searchTerms: searchTerms,
      });

      return {
        success: true,
        formattedResponse: response.response,
        sources: [],
        relatedQuestions: response.relatedQuestions,
        queryType: "general_search",
      };
    } catch (fallbackError) {
      return {
        success: false,
        formattedResponse: `Error processing query "${query}": ${originalError.message}`,
        sources: [],
        relatedQuestions: [],
        error: true,
      };
    }
  }

  /**
   * Enhance analysis result
   */
  async enhanceAnalysisResult(parsed, query) {
    // Add any missing fields and validate
    const issueArea = parsed.issueArea
      ? { component: parsed.issueArea, matchType: "claude" }
      : await this.extractIssueArea(query);

    return {
      queryType: parsed.queryType || "general_search",
      mainKeywords: parsed.mainKeywords || [],
      alternativeKeywords: parsed.alternativeKeywords || [],
      searchTerms: parsed.searchTerms || [],
      timeConstraint: parsed.timeConstraint || {
        type: "none",
        value: "",
        days: 7,
      },
      issueArea: issueArea,
      needsMultipleQueries: parsed.needsMultipleQueries || true,
      limit: 20,
    };
  }
}

export default new JiraAgentService();
