// server/agents/jira_agent/jiraAgentService.js
import llmGatewayService from "../../services/llmGatewayService.js";
import jiraClient from "./jiraClient.js";
import privacyVectorizer from "./privacyVectorizer.js";
import piiSanitizer from "./piiSanitizer.js";
import visualizationGenerator from "./visualizationGenerator.js";

class JiraAgentService {
  /**
   * Convert Issue Area to appropriate JQL search conditions
   * @param {string} issueArea - The application's issue area category
   * @returns {string} - JQL fragment for this issue area
   */
  issueAreaToJQL(issueArea) {
    if (!issueArea) return "";

    // Map issue areas to their proper JQL representation
    switch (issueArea) {
      case "Desktop Client":
      case "Mobile Client":
      case "Audio":
      case "Video":
        // These are actual components in Jira
        return `component = "${issueArea}" OR summary ~ "${issueArea}" OR description ~ "${issueArea}"`;

      case "Zoom AI":
        // This is not a component, so use text search only
        return `summary ~ "AI" OR description ~ "AI" OR summary ~ "meeting summary" OR description ~ "meeting summary"`;

      default:
        // For unknown issue areas, just use text search
        return `"issue area (component)[dropdown]" = "${issueArea}" OR summary ~ "${issueArea}" OR description ~ "${issueArea}"`;
    }
  }

  /**
   * Match query against common patterns to avoid LLM analysis
   * @param {string} query - The user query
   * @returns {object|null} - Matched pattern data or null if no match
   */
  matchQueryPattern(query) {
    const normalizedQuery = query.toLowerCase();

    // PATTERN 1: AI summary language issues
    if (
      (normalizedQuery.includes("ai summary") ||
        normalizedQuery.includes("ai summaries")) &&
      (normalizedQuery.includes("language") ||
        normalizedQuery.includes("incorrect language"))
    ) {
      console.log("[JiraAgentService] Matched AI summary language pattern");
      return {
        hasIssueArea: true,
        issueArea: "Zoom AI",
        hasProject: true,
        project: "ZSEE",
        needsClarification: false,
        queryType: "language_issue",
        parameters: {},
        jqlQuery:
          'project = ZSEE AND "issue area (component)[dropdown]" = "Zoom AI" AND text ~ "AI summary" AND text ~ "language" ORDER BY priority DESC',
      };
    }

    // PATTERN 2: High priority/highest ticket reports for specific component
    if (
      (normalizedQuery.includes("highest ticket") ||
        normalizedQuery.includes("high priority") ||
        normalizedQuery.includes("top issues")) &&
      (normalizedQuery.includes("desktop client") ||
        normalizedQuery.includes("mobile client") ||
        normalizedQuery.includes("audio") ||
        normalizedQuery.includes("video") ||
        normalizedQuery.includes("zoom ai"))
    ) {
      console.log("[JiraAgentService] Matched highest ticket report pattern");

      // Extract component/issue area - UPDATED to use correct component names
      let issueArea = "Desktop Clients"; // Default - Note the plural form
      if (normalizedQuery.includes("mobile client"))
        issueArea = "Mobile Client";
      else if (normalizedQuery.includes("audio")) issueArea = "Audio";
      else if (normalizedQuery.includes("video")) issueArea = "Video";
      else if (normalizedQuery.includes("zoom ai")) issueArea = "Zoom AI";

      // Extract time period
      let timeConstraint = "";
      if (normalizedQuery.includes("last week")) {
        timeConstraint =
          "AND created >= startOfWeek(-1) AND created <= endOfWeek(-1)";
      } else if (normalizedQuery.includes("this week")) {
        timeConstraint =
          "AND created >= startOfWeek() AND created <= endOfWeek()";
      } else if (normalizedQuery.includes("yesterday")) {
        timeConstraint =
          "AND created >= startOfDay(-1) AND created <= endOfDay(-1)";
      } else if (normalizedQuery.includes("today")) {
        timeConstraint =
          "AND created >= startOfDay() AND created <= endOfDay()";
      } else if (normalizedQuery.includes("last month")) {
        timeConstraint =
          "AND created >= startOfMonth(-1) AND created <= endOfMonth(-1)";
      } else if (normalizedQuery.includes("this month")) {
        timeConstraint =
          "AND created >= startOfMonth() AND created <= endOfMonth()";
      }

      return {
        hasIssueArea: true,
        issueArea: issueArea,
        hasProject: true,
        project: "ZSEE",
        needsClarification: false,
        queryType: "top_issues",
        parameters: {
          timeframe: normalizedQuery.includes("last week")
            ? "Last Week"
            : normalizedQuery.includes("this week")
            ? "This Week"
            : normalizedQuery.includes("yesterday")
            ? "Yesterday"
            : normalizedQuery.includes("today")
            ? "Today"
            : normalizedQuery.includes("last month")
            ? "Last Month"
            : normalizedQuery.includes("this month")
            ? "This Month"
            : "Recent",
        },
        jqlQuery: `project = ZSEE AND "issue area (component)[dropdown]" = "${issueArea}" ${timeConstraint} ORDER BY priority DESC, updated DESC`,
      };
    }

    // PATTERN 3: General search about issues in a component
    const searchTerms = [
      "search",
      "find",
      "look for",
      "any issue",
      "issues related to",
    ];
    const issueAreas = [
      { keywords: ["desktop client", "desktop app"], name: "Desktop Clients" }, // UPDATED to plural
      {
        keywords: ["mobile client", "mobile app", "ios app", "android app"],
        name: "Mobile Client",
      },
      { keywords: ["audio"], name: "Audio" },
      { keywords: ["video"], name: "Video" },
      { keywords: ["zoom ai", "ai summary", "ai summaries"], name: "Zoom AI" },
    ];

    if (searchTerms.some((term) => normalizedQuery.includes(term))) {
      console.log("[JiraAgentService] Matched general search pattern");

      // Try to identify issue area
      let detectedIssueArea = null;
      for (const area of issueAreas) {
        if (
          area.keywords.some((keyword) => normalizedQuery.includes(keyword))
        ) {
          detectedIssueArea = area.name;
          break;
        }
      }

      if (detectedIssueArea) {
        // Build JQL based on keywords from the query
        let jqlQuery = `project = ZSEE AND "issue area (component)[dropdown]" = "${detectedIssueArea}"`;

        // Extract meaningful search terms from the query
        const queryWords = normalizedQuery
          .replace(
            /search|in|jira|if|any|issue|issues|related|to|find|look|for/g,
            ""
          )
          .trim()
          .split(/\s+/)
          .filter((word) => word.length > 3)
          .filter(
            (word) =>
              ![
                "desktop",
                "client",
                "clients",
                "mobile",
                "audio",
                "video",
                "zoom",
              ].includes(word)
          );

        // Add extracted keywords to the query
        if (queryWords.length > 0) {
          queryWords.forEach((word) => {
            jqlQuery += ` AND text ~ "${word}"`;
          });
        }

        // Add timeframe if mentioned
        if (normalizedQuery.includes("last week")) {
          jqlQuery +=
            " AND created >= startOfWeek(-1) AND created <= endOfWeek(-1)";
        } else if (normalizedQuery.includes("this week")) {
          jqlQuery +=
            " AND created >= startOfWeek() AND created <= endOfWeek()";
        }

        jqlQuery += " ORDER BY priority DESC, updated DESC";

        return {
          hasIssueArea: true,
          issueArea: detectedIssueArea,
          hasProject: true,
          project: "ZSEE",
          needsClarification: false,
          queryType: "general",
          parameters: {},
          jqlQuery: jqlQuery,
        };
      }
    }

    // PATTERN 4: Direct ticket search
    const ticketPattern = /\b([A-Z]+-\d+)\b/i; // Match Jira ticket keys like ZSEE-12345
    const ticketMatch = query.match(ticketPattern);

    if (ticketMatch) {
      const ticketKey = ticketMatch[1].toUpperCase();
      console.log(
        `[JiraAgentService] Matched direct ticket pattern: ${ticketKey}`
      );

      return {
        hasIssueArea: false,
        issueArea: null,
        hasProject: true,
        project: ticketKey.split("-")[0], // Extract project key
        needsClarification: false,
        queryType: "ticket_summary",
        parameters: {
          ticketKey: ticketKey,
        },
        jqlQuery: `key = "${ticketKey}"`,
      };
    }

    // PATTERN 5: MTTR (Mean Time To Resolution) queries
    if (
      (normalizedQuery.includes("mttr") ||
        normalizedQuery.includes("mean time to resolution") ||
        normalizedQuery.includes("time to resolve") ||
        normalizedQuery.includes("resolution time")) &&
      (normalizedQuery.includes("desktop client") ||
        normalizedQuery.includes("mobile client") ||
        normalizedQuery.includes("audio") ||
        normalizedQuery.includes("video") ||
        normalizedQuery.includes("zoom ai"))
    ) {
      console.log("[JiraAgentService] Matched MTTR query pattern");

      // Extract component/issue area
      let issueArea = "Desktop Clients"; // Default - Note the plural form
      if (normalizedQuery.includes("mobile client"))
        issueArea = "Mobile Client";
      else if (normalizedQuery.includes("audio")) issueArea = "Audio";
      else if (normalizedQuery.includes("video")) issueArea = "Video";
      else if (normalizedQuery.includes("zoom ai")) issueArea = "Zoom AI";

      // Extract time period
      let timeConstraint = "AND resolutiondate >= startOfMonth(-1)"; // Default to last month
      if (normalizedQuery.includes("last week")) {
        timeConstraint =
          "AND resolutiondate >= startOfWeek(-1) AND resolutiondate <= endOfWeek(-1)";
      } else if (normalizedQuery.includes("this week")) {
        timeConstraint =
          "AND resolutiondate >= startOfWeek() AND resolutiondate <= endOfWeek()";
      } else if (normalizedQuery.includes("last month")) {
        timeConstraint =
          "AND resolutiondate >= startOfMonth(-1) AND resolutiondate <= endOfMonth(-1)";
      } else if (normalizedQuery.includes("this month")) {
        timeConstraint =
          "AND resolutiondate >= startOfMonth() AND resolutiondate <= endOfMonth()";
      } else if (normalizedQuery.includes("last 30 days")) {
        timeConstraint = "AND resolutiondate >= startOfDay(-30)";
      } else if (normalizedQuery.includes("last 90 days")) {
        timeConstraint = "AND resolutiondate >= startOfDay(-90)";
      }

      return {
        hasIssueArea: true,
        issueArea: issueArea,
        hasProject: true,
        project: "ZSEE",
        needsClarification: false,
        queryType: "mttr",
        parameters: {
          timeframe: normalizedQuery.includes("last week")
            ? "Last Week"
            : normalizedQuery.includes("this week")
            ? "This Week"
            : normalizedQuery.includes("last month")
            ? "Last Month"
            : normalizedQuery.includes("this month")
            ? "This Month"
            : normalizedQuery.includes("last 30 days")
            ? "Last 30 Days"
            : normalizedQuery.includes("last 90 days")
            ? "Last 90 Days"
            : "Last Month",
        },
        jqlQuery: `project = ZSEE AND "issue area (component)[dropdown]" = "${issueArea}" AND resolution IS NOT EMPTY ${timeConstraint} ORDER BY resolutiondate DESC`,
      };
    }

    // PATTERN 6: Bug reports for versions
    const versionPatterns = [
      /version (\d+\.\d+(\.\d+)?)/i,
      /v(\d+\.\d+(\.\d+)?)/i,
      /(\d+\.\d+(\.\d+)?) bugs/i,
      /(\d+\.\d+(\.\d+)?) issues/i,
    ];

    for (const pattern of versionPatterns) {
      const match = normalizedQuery.match(pattern);
      if (match && normalizedQuery.includes("bug")) {
        const version = match[1];
        console.log(
          `[JiraAgentService] Matched version bug report pattern: ${version}`
        );

        // Try to identify issue area
        let issueArea = null;
        for (const area of issueAreas) {
          if (
            area.keywords.some((keyword) => normalizedQuery.includes(keyword))
          ) {
            issueArea = area.name;
            break;
          }
        }

        let jqlQuery = `project = ZSEE AND type = Bug AND fixVersion = "${version}"`;
        if (issueArea) {
          jqlQuery += ` AND "issue area (component)[dropdown]" = "${issueArea}"`;
        }

        jqlQuery += " ORDER BY priority DESC, created DESC";

        return {
          hasIssueArea: issueArea !== null,
          issueArea: issueArea,
          hasProject: true,
          project: "ZSEE",
          needsClarification: false,
          queryType: "bug_report",
          parameters: {
            version: version,
          },
          jqlQuery: jqlQuery,
        };
      }
    }

    // PATTERN 7: Language-specific issues
    const languages = [
      "english",
      "spanish",
      "french",
      "german",
      "japanese",
      "chinese",
      "korean",
      "portuguese",
      "italian",
      "russian",
      "dutch",
    ];
    let detectedLanguage = null;

    for (const language of languages) {
      if (normalizedQuery.includes(language)) {
        detectedLanguage = language;
        break;
      }
    }

    if (
      detectedLanguage &&
      (normalizedQuery.includes("localization") ||
        normalizedQuery.includes("translation") ||
        normalizedQuery.includes("language") ||
        normalizedQuery.includes("text"))
    ) {
      console.log(
        `[JiraAgentService] Matched language-specific issue pattern: ${detectedLanguage}`
      );

      let jqlQuery = `project = ZSEE AND text ~ "${detectedLanguage}" AND (text ~ "localization" OR text ~ "translation")`;

      // Try to identify issue area
      for (const area of issueAreas) {
        if (
          area.keywords.some((keyword) => normalizedQuery.includes(keyword))
        ) {
          jqlQuery += ` AND "issue area (component)[dropdown]" = "${area.name}"`;
          break;
        }
      }

      jqlQuery += " ORDER BY updated DESC";

      return {
        hasIssueArea: false, // Don't need clarification even if no area detected
        issueArea: null,
        hasProject: true,
        project: "ZSEE",
        needsClarification: false,
        queryType: "general",
        parameters: {
          language: detectedLanguage,
        },
        jqlQuery: jqlQuery,
      };
    }

    // No pattern matched, return null and let the regular flow handle it
    return null;
  }

  /**
   * Process a natural language query about Jira
   */
  async processQuery(query, chatHistory = [], options = {}) {
    console.log(`[JiraAgentService] Processing query: "${query}"`);

    try {
      // Handle ticket-specific queries first
      const ticketPattern = /([A-Z]+-\d+)/i;
      const ticketMatch = query.match(ticketPattern);

      if (ticketMatch) {
        const ticketKey = ticketMatch[1].toUpperCase();

        // Check if it's a sentiment analysis request
        if (
          query.toLowerCase().includes("sentiment") ||
          query.toLowerCase().includes("analyze sentiment")
        ) {
          return this.getTicketSentiment(ticketKey);
        }
        // Otherwise it's a regular ticket summary
        else {
          return this.getTicketSummary(ticketKey);
        }
      }

      // Handle visualization requests
      if (this.isVisualizationQuery(query)) {
        return this.handleVisualizationRequest(query);
      }

      // Determine query intent
      const queryIntent = this.determineQueryIntent(query);

      // Generate appropriate JQL based on intent
      const jqlQuery = this.generateJqlForIntent(query, queryIntent);
      console.log(`[JiraAgentService] Generated JQL: ${jqlQuery}`);

      // Execute the query
      const jiraResults = await jiraClient.searchIssues(jqlQuery, 50);
      console.log(`[JiraAgentService] Found ${jiraResults.length} results`);

      // Format the response based on intent
      return this.formatResponseByIntent(query, jiraResults, queryIntent);
    } catch (error) {
      console.error(`[JiraAgentService] Error processing query:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error processing query: ${error.message}`,
      };
    }
  }

  /**
   * Determine the intent of a query
   */
  determineQueryIntent(query) {
    const normalizedQuery = query.toLowerCase();

    // Extract projects first
    let projects = [];
    if (normalizedQuery.includes("zsee")) projects.push("ZSEE");
    if (normalizedQuery.includes("zoom")) projects.push("ZOOM");

    // Bug report intent
    if (
      (normalizedQuery.includes("bug") || normalizedQuery.includes("defect")) &&
      (normalizedQuery.includes("report") || normalizedQuery.includes("issue"))
    ) {
      return {
        type: "bug_report",
        issueArea: this.extractIssueArea(normalizedQuery),
        version: this.extractVersion(normalizedQuery),
        timeframe: this.extractTimeframe(normalizedQuery),
        projects: projects.length > 0 ? projects : null,
      };
    }

    // Top issues intent
    if (
      normalizedQuery.includes("top") &&
      (normalizedQuery.includes("issue") || normalizedQuery.includes("ticket"))
    ) {
      return {
        type: "top_issues",
        issueArea: this.extractIssueArea(normalizedQuery),
        timeframe: this.extractTimeframe(normalizedQuery),
        limit: this.extractNumber(normalizedQuery) || 10,
      };
    }

    // AI summary or specific feature issues
    if (
      (normalizedQuery.includes("ai summary") ||
        normalizedQuery.includes("audio") ||
        normalizedQuery.includes("video")) &&
      (normalizedQuery.includes("not working") ||
        normalizedQuery.includes("issue"))
    ) {
      return {
        type: "feature_issue",
        feature: this.extractFeature(normalizedQuery),
        issueArea: this.extractIssueArea(normalizedQuery),
      };
    }

    // Default to general search
    return {
      type: "general",
      issueArea: this.extractIssueArea(normalizedQuery),
      keywords: this.extractKeywords(normalizedQuery),
    };
  }

  /**
   * Check if query is asking for visualization
   */
  isVisualizationQuery(query) {
    const normalizedQuery = query.toLowerCase();

    return (
      normalizedQuery.includes("create pie chart") ||
      normalizedQuery.includes("create table") ||
      normalizedQuery.includes("create heatmap") ||
      normalizedQuery.includes("visualization") ||
      normalizedQuery.includes("chart") ||
      normalizedQuery.includes("graph")
    );
  }

  /**
   * Handle visualization request
   */
  async handleVisualizationRequest(query) {
    const normalizedQuery = query.toLowerCase();

    // Determine visualization type
    let visualType = "pie_chart"; // Default
    if (normalizedQuery.includes("pie chart")) {
      visualType = "pie_chart";
    } else if (normalizedQuery.includes("table")) {
      visualType = "table";
    } else if (normalizedQuery.includes("heatmap")) {
      visualType = "heatmap";
    } else if (normalizedQuery.includes("bar chart")) {
      visualType = "bar_chart";
    } else if (normalizedQuery.includes("line chart")) {
      visualType = "line_chart";
    }

    // Extract parameters
    const issueArea = this.extractIssueArea(normalizedQuery);
    const engineer = this.extractEngineer(normalizedQuery);
    const project = this.extractProject(normalizedQuery) || "ZSEE";

    // Generate appropriate JQL
    let jqlQuery = `project = "${project}"`;

    if (issueArea) {
      jqlQuery += ` AND "issue area (component)[dropdown]" = "${issueArea}"`;
    }

    if (engineer) {
      jqlQuery += ` AND assignee = "${engineer}"`;
    }

    // Execute the query
    try {
      const jiraResults = await jiraClient.searchIssues(jqlQuery, 100);
      console.log(
        `[JiraAgentService] Found ${jiraResults.length} results for visualization`
      );

      // Generate visualization
      const visualization = await visualizationGenerator.createVisualization(
        jiraResults,
        visualType
      );

      if (visualization.error) {
        throw new Error(visualization.message);
      }

      // Return formatted result with visualization
      return {
        success: true,
        formattedResponse: visualization.textExplanation,
        visualization: {
          type: visualType,
          svgContent: visualization.visualContent,
        },
        sources: this.createSourcesFromJiraResults(jiraResults),
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error creating visualization:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error creating visualization: ${error.message}`,
      };
    }
  }

  /**
   * Get ticket sentiment analysis
   */
  async getTicketSentiment(issueKey) {
    console.log(`[JiraAgentService] Getting sentiment for ticket: ${issueKey}`);

    try {
      // Fetch the ticket
      const ticket = await jiraClient.getIssue(issueKey, {
        expand: "renderedFields,changelog,comments",
      });

      if (!ticket) {
        throw new Error(`Ticket ${issueKey} not found`);
      }

      // Fetch all comments
      const comments = await jiraClient.fetchAllComments(issueKey);

      // Take the latest 10 comments
      const latestComments = comments.slice(-10);

      // Use Claude to analyze sentiment
      const sentimentResponse = await llmGatewayService.query(
        `Analyze the sentiment in these comments for Jira ticket ${issueKey}:
      
      ${JSON.stringify(latestComments, null, 2)}
      
      Provide a detailed sentiment analysis including:
      1. Overall sentiment score (positive/negative/neutral)
      2. Key positive and negative phrases found
      3. Sentiment trends over time
      4. Main topics of discussion
      
      Format your response with clear sections and emoji headers.`,
        [],
        {
          systemMessage:
            "You are an expert at sentiment analysis for technical support tickets.",
          model: "claude-3-7-sonnet-20250219",
          temperature: 0.1,
        }
      );

      // Create source for frontend
      const sources = [
        {
          title: `${issueKey}: ${ticket.fields?.summary || "Jira Ticket"}`,
          url: `${
            process.env.JIRA_API_URL || "https://jira.example.com"
          }/browse/${issueKey}`,
          source: "Jira",
          type: "jira",
        },
      ];

      return {
        success: true,
        formattedResponse: sentimentResponse.content,
        sources,
        issueKey,
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error analyzing sentiment:`, error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error analyzing sentiment: ${error.message}`,
      };
    }
  }

  /**
   * Get ticket summary with latest comments
   */
  /**
   * Get summary of a specific Jira ticket without sanitization
   */
  /**
   * Get summary of a specific Jira ticket with Claude summarization
   */
  async getTicketSummary(issueKey) {
    console.log(`[JiraAgentService] Getting summary for ticket: ${issueKey}`);

    try {
      // Fetch the ticket with expanded fields
      const ticket = await jiraClient.getIssue(issueKey, {
        expand: "renderedFields,names,changelog,comments",
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
          "issuelinks",
          "components",
        ],
      });

      if (!ticket) {
        throw new Error(`Ticket ${issueKey} not found`);
      }

      // Process comments
      const comments = ticket.fields?.comment?.comments || [];
      const commentCount = comments.length;

      // Get the latest 10 comments
      const latestComments = comments.slice(-Math.min(10, comments.length));

      // Create a clean ticket object for Claude with proper text extraction
      const ticketForClaude = {
        key: issueKey,
        summary: ticket.fields?.summary || "No summary",
        status: ticket.fields?.status?.name || "Unknown",
        priority: ticket.fields?.priority?.name || "Unknown",
        assignee: ticket.fields?.assignee?.displayName || "Unassigned",
        reporter: ticket.fields?.reporter?.displayName || "Unknown",
        created: ticket.fields?.created
          ? new Date(ticket.fields.created).toISOString()
          : null,
        updated: ticket.fields?.updated
          ? new Date(ticket.fields.updated).toISOString()
          : null,
        // Process description - properly extract from ADF if needed
        description: this.extractRichTextContent(
          ticket.fields?.description,
          ticket.renderedFields?.description
        ),
        // Process comments - extract text from each comment
        comments: latestComments.map((comment) => ({
          author: comment.author?.displayName || "Unknown",
          created: comment.created
            ? new Date(comment.created).toISOString()
            : null,
          text: this.extractRichTextContent(comment.body, null),
        })),
      };

      // Always use Claude for summarization
      try {
        const summaryResponse = await llmGatewayService.query(
          `Summarize this Jira ticket information focusing on latest comments and the problem description:
        
        ${JSON.stringify(ticketForClaude, null, 2)}
        
        Create a clear, manager-friendly summary that includes:
        1. Basic ticket details with emojis as section headers
        2. A concise overview of the issue from the description
        3. Key insights from the latest ${
          ticketForClaude.comments.length
        } comments
        4. Important patterns or trends in the discussion
        5. Any action items or status updates mentioned
        
        Use Markdown formatting for readability. Aim for a concise but comprehensive summary under 400 words.`,
          [],
          {
            systemMessage:
              "You are an expert at analyzing and summarizing technical support tickets in a clear, concise manner.",
            model: "claude-3-7-sonnet-20250219",
            temperature: 0.1,
          }
        );

        // Create source information for frontend
        const sources = [
          {
            title: `${issueKey}: ${ticket.fields?.summary || "Jira Ticket"}`,
            url: `${
              process.env.JIRA_API_URL || "https://jira.example.com"
            }/browse/${issueKey}`,
            source: "Jira",
            type: "jira",
            citationLabel: issueKey,
          },
        ];

        return {
          success: true,
          formattedResponse: summaryResponse.content,
          sources,
          issueKey,
          ticket: {
            key: issueKey,
            summary: ticket.fields?.summary,
            status: ticket.fields?.status?.name,
            assignee: ticket.fields?.assignee?.displayName || "Unassigned",
            created: ticket.fields?.created,
            updated: ticket.fields?.updated,
            commentCount: commentCount,
          },
        };
      } catch (claudeError) {
        console.error(
          `[JiraAgentService] Claude summarization failed:`,
          claudeError
        );
        // Fall back to direct formatting if Claude fails
        return this.formatTicketDirectly(ticket, issueKey);
      }
    } catch (error) {
      console.error(
        `[JiraAgentService] Error getting ticket ${issueKey}:`,
        error
      );
      return {
        success: false,
        error: error.message,
        formattedResponse: `Failed to get summary for ${issueKey}: ${error.message}`,
      };
    }
  }

  /**
   * Extract text content from various Jira formats (ADF, HTML, etc.)
   * @param {Object|string} content - The content in ADF or string format
   * @param {string} renderedContent - Optional pre-rendered HTML version
   * @returns {string} - Plain text content
   */
  extractRichTextContent(content, renderedContent) {
    // Handle null/undefined content
    if (!content) return "No content available";

    // If it's already a string, return it directly
    if (typeof content === "string") {
      return content;
    }

    // If we have rendered HTML content, use it but strip HTML tags
    if (renderedContent) {
      try {
        // Basic HTML tag stripping
        return renderedContent
          .replace(/<[^>]*>/g, " ") // Replace HTML tags with spaces
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim();
      } catch (e) {
        console.error(
          "[JiraAgentService] Error processing rendered content:",
          e
        );
      }
    }

    // Handle Atlassian Document Format (ADF)
    try {
      if (
        content.type === "doc" &&
        content.content &&
        Array.isArray(content.content)
      ) {
        return this.processAdfContent(content);
      }

      // Legacy ADF format with just content array
      if (content.content && Array.isArray(content.content)) {
        return this.processAdfContent({ content: content.content });
      }
    } catch (e) {
      console.error("[JiraAgentService] Error extracting ADF content:", e);
    }

    // Last resort: try to stringify the object
    try {
      return typeof content === "object"
        ? JSON.stringify(content).substring(0, 200) + "..."
        : String(content);
    } catch (e) {
      return "Complex content (unable to display)";
    }
  }

  /**
   * Process Atlassian Document Format content recursively
   * @param {Object} docNode - ADF document node
   * @returns {string} - Extracted text
   */
  processAdfContent(docNode) {
    if (!docNode) return "";

    let result = "";

    // Handle text nodes directly
    if (docNode.type === "text") {
      return docNode.text || "";
    }

    // Process content arrays recursively
    if (docNode.content && Array.isArray(docNode.content)) {
      const textParts = docNode.content.map((node) =>
        this.processAdfContent(node)
      );
      result = textParts.join(" ");
    }

    // Add appropriate whitespace based on node type
    if (docNode.type === "paragraph") {
      result += "\n\n";
    } else if (docNode.type === "heading") {
      result += "\n\n";
    } else if (
      docNode.type === "bulletList" ||
      docNode.type === "orderedList"
    ) {
      result += "\n";
    } else if (docNode.type === "listItem") {
      result = "• " + result + "\n";
    } else if (docNode.type === "hardBreak") {
      result += "\n";
    }

    return result;
  }

  /**
   * Fallback formatter if Claude fails
   */
  formatTicketDirectly(ticket, issueKey) {
    try {
      // Basic ticket info
      const summary = {
        success: true,
        formattedResponse: `# Jira Ticket Summary: ${issueKey}

🆔 **Ticket:** ${issueKey}
📋 **Summary:** ${ticket.fields?.summary || "No summary"}
🎯 **Priority:** ${ticket.fields?.priority?.name || "Unknown"}
🛠 **Status:** ${ticket.fields?.status?.name || "Unknown"}
👤 **Assignee:** ${ticket.fields?.assignee?.displayName || "Unassigned"}
👥 **Reporter:** ${ticket.fields?.reporter?.displayName || "Unknown"}

🔍 **Issue Description:**
${this.extractRichTextContent(
  ticket.fields?.description,
  ticket.renderedFields?.description
).substring(0, 500)}${
          this.extractRichTextContent(
            ticket.fields?.description,
            ticket.renderedFields?.description
          ).length > 500
            ? "..."
            : ""
        }

📅 **Timeline:**
- Created: ${
          ticket.fields?.created
            ? new Date(ticket.fields.created).toLocaleString()
            : "Unknown"
        }
- Updated: ${
          ticket.fields?.updated
            ? new Date(ticket.fields.updated).toLocaleString()
            : "Unknown"
        }
`,
        sources: [
          {
            title: `${issueKey}: ${ticket.fields?.summary || "Jira Ticket"}`,
            url: `${
              process.env.JIRA_API_URL || "https://jira.example.com"
            }/browse/${issueKey}`,
            source: "Jira",
            type: "jira",
            citationLabel: issueKey,
          },
        ],
        issueKey,
        ticket: {
          key: issueKey,
          summary: ticket.fields?.summary,
          status: ticket.fields?.status?.name,
          assignee: ticket.fields?.assignee?.displayName || "Unassigned",
          created: ticket.fields?.created,
          updated: ticket.fields?.updated,
          commentCount: ticket.fields?.comment?.comments?.length || 0,
        },
      };

      // Add recent comments if available
      const comments = ticket.fields?.comment?.comments || [];
      if (comments.length > 0) {
        summary.formattedResponse += `\n🗣️ **Recent Comments:**\n`;

        // Add up to 3 most recent comments
        const recentComments = comments.slice(-Math.min(3, comments.length));
        recentComments.forEach((comment) => {
          const author = comment.author?.displayName || "Unknown";
          const date = comment.created
            ? new Date(comment.created).toLocaleDateString()
            : "Unknown date";
          const text = this.extractRichTextContent(comment.body, null);

          summary.formattedResponse += `\n• **${author}** (${date}):\n  ${text.substring(
            0,
            200
          )}${text.length > 200 ? "..." : ""}\n`;
        });
      }

      return summary;
    } catch (error) {
      console.error(`[JiraAgentService] Error in direct formatting:`, error);

      // Ultra-simple fallback
      return {
        success: true,
        formattedResponse: `# Jira Ticket ${issueKey}\n\n${
          ticket.fields?.summary || "No summary available"
        }\n\nUnable to process full ticket details.`,
        sources: [
          {
            title: `${issueKey}: ${ticket.fields?.summary || "Jira Ticket"}`,
            url: `${
              process.env.JIRA_API_URL || "https://jira.example.com"
            }/browse/${issueKey}`,
            source: "Jira",
            type: "jira",
          },
        ],
        issueKey,
        ticket: {
          key: issueKey,
          summary: ticket.fields?.summary,
        },
      };
    }
  }

  /**
   * Format ticket directly without Claude
   */

  /**
   * Extract description text safely
   */
  extractDescriptionText(description) {
    if (!description) return "No description available";

    // If string, return directly
    if (typeof description === "string") {
      return (
        description.substring(0, 500) + (description.length > 500 ? "..." : "")
      );
    }

    // Handle Atlassian Document Format
    try {
      if (description.content && Array.isArray(description.content)) {
        return (
          description.content
            .map((block) => {
              if (block.content && Array.isArray(block.content)) {
                return block.content
                  .map((inline) => inline.text || "")
                  .join(" ");
              }
              return "";
            })
            .join("\n\n")
            .substring(0, 500) + "..."
        );
      }
    } catch (e) {
      console.error("[JiraAgentService] Error extracting description:", e);
    }

    // Fallback
    return "Description available but format could not be processed";
  }

  /**
   * Extract comment text safely
   */
  extractCommentText(commentBody) {
    if (!commentBody) return "";

    // If string, return directly
    if (typeof commentBody === "string") {
      return commentBody;
    }

    // Handle Atlassian Document Format
    try {
      if (commentBody.content && Array.isArray(commentBody.content)) {
        return commentBody.content
          .map((block) => {
            if (block.content && Array.isArray(block.content)) {
              return block.content.map((inline) => inline.text || "").join(" ");
            }
            return "";
          })
          .join("\n\n");
      }
    } catch (e) {
      console.error("[JiraAgentService] Error extracting comment text:", e);
    }

    // Fallback
    return "Comment available but format could not be processed";
  }

  /**
   * Generate JQL for the determined intent
   */
  generateJqlForIntent(query, intent) {
    let jql = "";

    // ALWAYS use both projects unless specifically restricted to one
    // This fixes the "is there any bug report for last week?" issue
    const useBothProjects = true;

    if (useBothProjects) {
      jql = `project in ("ZSEE", "ZOOM")`;
    } else if (intent.project) {
      jql = `project = "${intent.project}"`;
    } else {
      jql = `project = "ZSEE"`;
    }

    switch (intent.type) {
      case "bug_report":
        jql += ` AND type = Bug`;

        // Add issue area filter
        if (intent.issueArea) {
          jql += ` AND "issue area (component)[dropdown]" = "${intent.issueArea}"`;
        }

        // Add version filter - ALWAYS USE "=" operator with proper format
        if (intent.version) {
          // Format version as "Client X.Y.Z"
          const formattedVersion = this.formatVersionForJql(intent.version);

          // Always use equality operator since '>' is not supported
          jql += ` AND "found in version[dropdown]" = "${formattedVersion}"`;
        }

        // Add timeframe filter
        if (intent.timeframe) {
          jql += this.getTimeframeJqlClause(intent.timeframe);
        }

        jql += ` ORDER BY priority DESC, created DESC`;
        break;

      // Rest of the cases remain the same..
      case "top_issues":
        if (intent.issueArea) {
          jql += ` AND "issue area (component)[dropdown]" = "${intent.issueArea}"`;
        }

        if (intent.timeframe) {
          jql += this.getTimeframeJqlClause(intent.timeframe);
        }

        jql += ` ORDER BY priority DESC, updatedDate DESC`;
        break;

      case "feature_issue":
        if (intent.issueArea) {
          jql += ` AND "issue area (component)[dropdown]" = "${intent.issueArea}"`;
        }

        if (intent.feature) {
          jql += ` AND text ~ "${intent.feature}"`;
        }

        if (query.toLowerCase().includes("not working")) {
          jql += ` AND text ~ "not working"`;
        }

        jql += ` ORDER BY created DESC`;
        break;

      case "general":
      default:
        if (intent.issueArea) {
          jql += ` AND "issue area (component)[dropdown]" = "${intent.issueArea}"`;
        }

        if (intent.keywords && intent.keywords.length > 0) {
          intent.keywords.forEach((keyword) => {
            if (keyword.length > 3) {
              jql += ` AND text ~ "${keyword}"`;
            }
          });
        }

        jql += ` ORDER BY updatedDate DESC`;
        break;
    }
    console.log(`[JiraAgentService] Generated JQL: ${jql}`);
    return jql;
  }
  formatVersionForJql(version) {
    if (!version) return null;

    // Check if version already has "Client" prefix
    if (version.toLowerCase().startsWith("client")) {
      return version;
    }

    // Otherwise, add "Client" prefix
    return `Client ${version}`;
  }
  /**
   * Format response based on intent
   */
  formatResponseByIntent(query, jiraResults, intent) {
    try {
      // If no results
      if (!jiraResults || jiraResults.length === 0) {
        return {
          success: true,
          formattedResponse: `No Jira issues found matching your query across ZSEE and ZOOM projects${
            intent.issueArea ? ` for ${intent.issueArea}` : ""
          }.`,
          sources: [],
        };
      }

      // Limit results to 10 for display
      const limitedResults = jiraResults.slice(0, 10);
      const jiraBaseUrl =
        process.env.JIRA_API_URL || "https://jira.example.com";

      let response = "";

      // Format based on intent type
      switch (intent.type) {
        case "bug_report":
          // For version-based queries, show the formatted version
          if (intent.version) {
            const formattedVersion = this.formatVersionForJql(intent.version);
            response = `## Bug Report for Version "${formattedVersion}" (ZSEE and ZOOM)${
              intent.issueArea ? ` in ${intent.issueArea}` : ""
            }\n\n`;
          } else if (intent.timeframe) {
            response = `## Bug Report (ZSEE and ZOOM)${
              intent.issueArea ? ` in ${intent.issueArea}` : ""
            } for ${this.formatTimeframe(intent.timeframe)}\n\n`;
          } else {
            response = `## Bug Report (ZSEE and ZOOM)${
              intent.issueArea ? ` in ${intent.issueArea}` : ""
            }\n\n`;
          }

          response += `Found ${jiraResults.length} bugs. Here are the most relevant:\n\n`;
          break;

        case "top_issues":
          response = `## Top Issues${
            intent.issueArea ? ` for ${intent.issueArea}` : ""
          }${
            intent.timeframe
              ? ` (${this.formatTimeframe(intent.timeframe)})`
              : ""
          }\n\n`;
          response += `Found ${jiraResults.length} issues. Here are the highest priority ones:\n\n`;
          break;

        case "feature_issue":
          response = `## Issues Related to "${
            intent.feature || "Feature"
          }"\n\n`;
          response += `Found ${jiraResults.length} issues. Here are the most relevant:\n\n`;
          break;

        case "general":
        default:
          response = `## Jira Search Results\n\n`;
          response += `Found ${jiraResults.length} issues matching your query. Here are the most relevant:\n\n`;
          break;
      }

      // List the issues with embedded links
      for (let i = 0; i < limitedResults.length; i++) {
        const issue = limitedResults[i];
        if (!issue || !issue.key) continue;

        const issueUrl = `${jiraBaseUrl}/browse/${issue.key}`;
        const projectId = issue.key.split("-")[0]; // Extract ZSEE or ZOOM

        response += `${i + 1}. **[${issue.key}](${issueUrl})**: "${
          issue.fields?.summary || "No summary"
        }"\n`;
        response += `   * Project: ${projectId}\n`;
        response += `   * Status: ${issue.fields?.status?.name || "Unknown"}\n`;
        response += `   * Priority: ${
          issue.fields?.priority?.name || "Unknown"
        }\n`;

        // Show "Found in Version" when available - using safe navigation
        const foundInVersion =
          issue.fields?.["found in version[dropdown]"]?.value ||
          issue.fields?.customfield_10000?.value || // Example fallback
          "Unknown";
        response += `   * Found in Version: ${foundInVersion}\n`;

        response += `   * Assignee: ${
          issue.fields?.assignee?.displayName || "Unassigned"
        }\n`;

        // Add created date
        if (issue.fields?.created) {
          const createdDate = new Date(issue.fields.created);
          response += `   * Created: ${createdDate.toLocaleDateString()}\n`;
        }

        response += "\n";
      }

      // Add basic statistics
      if (jiraResults.length > 1) {
        response += `### Summary\n`;

        // Project breakdown
        const projectCounts = {};
        jiraResults.forEach((issue) => {
          const projectId = issue.key.split("-")[0];
          projectCounts[projectId] = (projectCounts[projectId] || 0) + 1;
        });

        if (Object.keys(projectCounts).length > 0) {
          response += `- Project breakdown: `;
          Object.entries(projectCounts).forEach(
            ([project, count], index, array) => {
              response += `${count} in ${project}${
                index < array.length - 1 ? ", " : ""
              }`;
            }
          );
          response += "\n";
        }

        // Priority breakdown
        const priorityCounts = {};
        jiraResults.forEach((issue) => {
          if (!issue?.fields?.priority?.name) return;
          const priority = issue.fields.priority.name;
          priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
        });

        if (Object.keys(priorityCounts).length > 0) {
          response += `- Priority breakdown: `;
          const priorityOrder = ["Critical", "High", "Medium", "Low"];
          let addedCount = 0;

          priorityOrder.forEach((priority) => {
            if (priorityCounts[priority]) {
              if (addedCount > 0) response += ", ";
              response += `${priorityCounts[priority]} ${priority}`;
              addedCount++;
            }
          });
          response += `\n`;
        }
      }

      return {
        success: true,
        formattedResponse: response,
        intentType: intent.type,
        sources: this.createSourcesFromJiraResults(jiraResults),
      };
    } catch (error) {
      console.error("[JiraAgentService] Error formatting response:", error);
      return {
        success: false,
        error: error.message,
        formattedResponse: `Error formatting results: ${error.message}`,
      };
    }
  }

  /**
   * Helper methods for parameter extraction
   */

  // Extract issue area from query
  extractIssueArea(query) {
    const areas = [
      {
        keywords: ["desktop client", "desktop clients", "desktop app"],
        name: "Desktop Clients",
      },
      {
        keywords: ["mobile client", "mobile app", "ios app", "android app"],
        name: "Mobile Client",
      },
      { keywords: ["audio"], name: "Audio" },
      { keywords: ["video"], name: "Video" },
      { keywords: ["zoom ai", "ai summary", "ai summaries"], name: "Zoom AI" },
    ];

    for (const area of areas) {
      if (area.keywords.some((keyword) => query.includes(keyword))) {
        return area.name;
      }
    }

    return null;
  }

  // Extract version from query
  extractVersion(query) {
    // Check for version with "Client" prefix
    const clientPrefixMatch = query.match(/client\s+(\d+\.\d+\.\d+|\d+\.\d+)/i);
    if (clientPrefixMatch) {
      return clientPrefixMatch[1];
    }

    // Check for suffix version format
    const clientVersionMatch = query.match(
      /(\d+\.\d+\.\d+|\d+\.\d+)\s*(client|release)/i
    );
    if (clientVersionMatch) {
      return clientVersionMatch[1];
    }

    // Regular version format
    const versionMatch = query.match(/(\d+\.\d+\.\d+|\d+\.\d+)/);
    return versionMatch ? versionMatch[1] : null;
  }

  // Extract timeframe from query
  extractTimeframe(query) {
    if (query.includes("last week")) return "last_week";
    if (query.includes("this week")) return "this_week";
    if (query.includes("yesterday")) return "yesterday";
    if (query.includes("today")) return "today";
    if (query.includes("last month")) return "last_month";
    return null;
  }

  // Extract feature from query
  extractFeature(query) {
    if (query.includes("ai summary")) return "AI summary";
    if (query.includes("audio")) return "Audio";
    if (query.includes("video")) return "Video";
    return null;
  }

  // Extract engineer from query
  extractEngineer(query) {
    // This would need to be implemented based on your specific naming patterns
    // Or perhaps integrated with a user directory
    return null;
  }

  // Extract project from query
  extractProject(query) {
    if (query.includes("ZSEE")) return "ZSEE";
    if (query.includes("ZOOM")) return "ZOOM";
    return "ZSEE"; // Default
  }

  // Extract keywords from query
  extractKeywords(query) {
    // Remove common words and keep meaningful terms
    return query
      .toLowerCase()
      .replace(
        /is there|are there|find|search|look for|get|jira|ticket|issue|issues|bug|bugs|defect|defects|create|make|please|can you/g,
        ""
      )
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 3);
  }

  // Get JQL clause for timeframe
  getTimeframeJqlClause(timeframe) {
    switch (timeframe) {
      case "last_week":
        return " AND created >= startOfWeek(-1) AND created <= endOfWeek(-1)";
      case "this_week":
        return " AND created >= startOfWeek() AND created <= endOfWeek()";
      case "yesterday":
        return " AND created >= startOfDay(-1) AND created <= endOfDay(-1)";
      case "today":
        return " AND created >= startOfDay()";
      case "last_month":
        return " AND created >= startOfMonth(-1) AND created <= endOfMonth(-1)";
      default:
        return "";
    }
  }

  // Format timeframe for display
  formatTimeframe(timeframe) {
    switch (timeframe) {
      case "last_week":
        return "Last Week";
      case "this_week":
        return "This Week";
      case "yesterday":
        return "Yesterday";
      case "today":
        return "Today";
      case "last_month":
        return "Last Month";
      default:
        return "";
    }
  }

  /**
   * Extract plain text from Atlassian Document Format
   */
  extractPlainTextFromADF(content) {
    if (!content) return "";

    // Handle string content
    if (typeof content === "string") return content;

    // Handle ADF content
    try {
      if (content.content && Array.isArray(content.content)) {
        return content.content
          .map((block) => {
            if (block.content && Array.isArray(block.content)) {
              return block.content.map((inline) => inline.text || "").join(" ");
            }
            return "";
          })
          .join("\n\n");
      }
    } catch (e) {
      console.error("[JiraAgentService] Error extracting text from ADF:", e);
    }

    // Fallback
    return typeof content === "object"
      ? JSON.stringify(content)
      : String(content);
  }
  /**
   * Format results with or without Claude based on query type
   */
  async formatResultsWithClaude(query, jiraResults, analysisData) {
    try {
      console.log(
        `[JiraAgentService] Formatting results for query type: ${analysisData.queryType}`
      );

      // For most query types, use direct formatting without sending to Claude
      if (
        analysisData.queryType !== "sentiment_analysis" &&
        analysisData.queryType !== "ticket_summary"
      ) {
        // Use direct formatting for common query types
        return this.formatResultsDirectly(query, jiraResults, analysisData);
      }

      // Only use Claude for sentiment analysis and ticket summary
      // Prepare context for Claude - limit size by only including necessary fields
      const slimResults = jiraResults.map((issue) => ({
        key: issue.key,
        fields: {
          summary: issue.fields?.summary,
          description: issue.fields?.description,
          status: issue.fields?.status?.name,
          priority: issue.fields?.priority?.name,
          assignee: issue.fields?.assignee?.displayName,
          reporter: issue.fields?.reporter?.displayName,
          created: issue.fields?.created,
          updated: issue.fields?.updated,
          comment: issue.fields?.comment,
        },
      }));

      // Limit to 5 items for sentiment analysis or 1 for ticket summary
      const limitedResults =
        analysisData.queryType === "sentiment_analysis"
          ? slimResults.slice(0, 5)
          : slimResults.slice(0, 1);

      const resultsJson = JSON.stringify(limitedResults, null, 2);

      // Create appropriate prompt
      let formattingPrompt = "";
      if (analysisData.queryType === "sentiment_analysis") {
        formattingPrompt = `Analyze the sentiment in these Jira comments. Format your response as:
      
## Sentiment Analysis for ${limitedResults[0]?.key || "Ticket"}
🆔 Ticket: ${limitedResults[0]?.key || "N/A"}
📊 Overall Sentiment: [positive/negative/neutral] ([score])
🔍 Analysis Based On: [number] text elements

🔑 Key Sentiment Indicators:
✅ Positive Terms: [count] mentions ([examples])
❌ Negative Terms: [count] mentions ([examples])

💬 Comment Sentiment Trend:
[Trend analysis]

📝 Summary Analysis:
[Brief explanation of sentiment patterns]
      `;
      } else if (analysisData.queryType === "ticket_summary") {
        formattingPrompt = `Summarize this Jira ticket into a manager-friendly format:
      
# Jira Ticket Summary (AI-Generated)
🆔 Ticket: ${limitedResults[0]?.key || "N/A"}
📋 Summary: [ticket.fields.summary]
🎯 Priority: [ticket.fields.priority]
🛠 Status: [ticket.fields.status]
👤 Assignee: [ticket.fields.assignee]

🔍 Issue Overview
[Short description from ticket fields.description, max 300 chars]

📅 Timeline
- Created: [format ticket.fields.created as readable date]
- Updated: [format ticket.fields.updated as readable date]

✨ Key Points
[Include 2-3 important insights about this ticket]
      `;
      }

      // Call Claude with limited data
      const formattedResponse = await llmGatewayService.query(
        `Format this Jira ${
          analysisData.queryType === "sentiment_analysis"
            ? "data for sentiment analysis"
            : "ticket for a summary"
        }:

${resultsJson}

${formattingPrompt}

Be concise but thorough, and format your response using Markdown.`,
        [],
        {
          systemMessage: "You are an expert at analyzing Jira ticket data.",
          model: "claude-3-7-sonnet-20250219",
          temperature: 0.2,
        }
      );

      return {
        success: true,
        formattedResponse: formattedResponse.content,
        intentType: analysisData.queryType,
        sources: this.createSourcesFromJiraResults(jiraResults),
      };
    } catch (error) {
      console.error(
        "[JiraAgentService] Error formatting results with Claude:",
        error
      );
      return this.formatResultsDirectly(query, jiraResults, analysisData);
    }
  }

  /**
   * Create a basic formatted response if Claude formatting fails
   */
  createBasicFormattedResponse(jiraResults, queryData, originalQuery) {
    const issueArea = queryData.issueArea || "specified component";
    const queryType = queryData.queryType || "general";
    const timeframe = queryData.parameters?.timeframe || "recent";

    let response = `# Jira Search Results\n\n`;

    if (!jiraResults || jiraResults.length === 0) {
      response += `No issues found for your query about ${issueArea}.\n`;
      return response;
    }

    if (queryType === "top_issues") {
      response += `## Top Issues for ${issueArea} (${timeframe})\n\n`;
      response += `I've analyzed ${jiraResults.length} issues and found these to be the highest priority:\n\n`;
    } else if (queryType === "language_issue") {
      response += `## AI Summary Language Issues Found\n\n`;
      response += `I've found ${jiraResults.length} Jira issues related to incorrect AI summary language:\n\n`;
    } else {
      response += `## Issues Found for ${issueArea}\n\n`;
      response += `Found ${jiraResults.length} issues matching your query.\n\n`;
    }

    // Display top issues (up to 10)
    const displayCount = Math.min(10, jiraResults.length);
    for (let i = 0; i < displayCount; i++) {
      const issue = jiraResults[i];
      if (!issue || !issue.key) continue;

      response += `${i + 1}. **${issue.key}: "${
        issue.fields?.summary || "No summary"
      }"**\n`;
      response += `   * Status: ${issue.fields?.status?.name || "Unknown"}\n`;
      response += `   * Priority: ${
        issue.fields?.priority?.name || "Unknown"
      }\n`;
      response += `   * Assignee: ${
        issue.fields?.assignee?.displayName || "Unassigned"
      }\n`;

      // Format date if available
      if (issue.fields?.created) {
        const createdDate = new Date(issue.fields.created);
        response += `   * Created: ${createdDate.toLocaleDateString()}\n`;
      }

      response += "\n";
    }

    // Add a simple summary
    response += `### Summary\n`;

    // Count by priority
    const priorityCounts = {};
    jiraResults.forEach((issue) => {
      if (!issue || !issue.fields) return;
      const priority = issue.fields?.priority?.name || "Unknown";
      priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
    });

    // Add priority counts
    Object.entries(priorityCounts).forEach(([priority, count]) => {
      const percentage = Math.round((count / jiraResults.length) * 100);
      response += `- ${count} ${priority} priority issues (${percentage}%)\n`;
    });

    // Count by status
    const statusCounts = {};
    jiraResults.forEach((issue) => {
      if (!issue || !issue.fields) return;
      const status = issue.fields?.status?.name || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Find most common status
    let mostCommonStatus = "Unknown";
    let maxStatusCount = 0;
    Object.entries(statusCounts).forEach(([status, count]) => {
      if (count > maxStatusCount) {
        mostCommonStatus = status;
        maxStatusCount = count;
      }
    });

    if (jiraResults.length > 0) {
      const mostCommonPercentage = Math.round(
        (maxStatusCount / jiraResults.length) * 100
      );
      response += `- ${mostCommonPercentage}% of issues are currently in "${mostCommonStatus}" status\n`;
    }

    return response;
  }

  createSourcesFromJiraResults(jiraResults) {
    if (!jiraResults || !Array.isArray(jiraResults)) {
      return [];
    }

    return jiraResults.map((issue) => {
      // Handle standard jiraClient result format
      if (issue && issue.key) {
        return {
          title: `${issue.key}: ${issue.fields?.summary || "Jira Ticket"}`,
          url: `${
            process.env.JIRA_API_URL || "https://jira.example.com"
          }/browse/${issue.key}`,
          source: "Jira",
          type: "jira",
          citationLabel: issue.key,
        };
      }

      // Handle already formatted results
      if (issue && issue.title && issue.url) {
        return {
          ...issue,
          type: "jira",
          source: issue.source || "Jira",
        };
      }

      // Fallback for unexpected formats
      return {
        title: issue?.title || "Jira Result",
        url: issue?.url || null,
        source: "Jira",
        type: "jira",
      };
    });
  }

  generatePatternJQL(query, patternData) {
    // Start with project filter
    let jql = `project = "${patternData.project || "ZSEE"}"`;

    // Add issue area/component filter if specified
    if (patternData.issueArea) {
      jql += ` AND component = "${patternData.issueArea}"`;
    }

    // Add text search based on query keywords
    const keywordSets = [
      // Extract meaningful keywords from the query
      query
        .toLowerCase()
        .replace(
          /search|in|jira|if|any|issue|related|to|not|coming|in|which|was|during|the/g,
          ""
        )
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 3),
    ];

    // Add each keyword set
    keywordSets.forEach((keywords) => {
      if (keywords.length > 0) {
        keywords.forEach((keyword) => {
          if (keyword) {
            jql += ` AND text ~ "${keyword}"`;
          }
        });
      }
    });

    // Add sorting
    jql += " ORDER BY priority DESC";

    return jql;
  }

  async processQueryWithContext(query, analysisData, chatHistory = []) {
    try {
      console.log(`[JiraAgentService] Processing with context:`, analysisData);

      // Step 1: Generate JQL based on the query type and Issue Area/Project
      let jqlQuery = "";
      try {
        const jqlGeneration = await llmGatewayService.query(
          `Generate a JQL query for this request: "${query}"
  
  Context:
  - Issue Area: ${analysisData.issueArea || "Not specified"}
  - Project: ${analysisData.project || "Not specified"}
  - Query Type: ${analysisData.queryType}
  
  The JQL query must:
  1. Include project = "${
    analysisData.project || "ZSEE"
  }" if project is specified
  2. Include appropriate fields to filter by Issue Area: "${
    analysisData.issueArea
  }" if specified
     (typically use "issue area (component)[dropdown]" = "${
       analysisData.issueArea
     }" instead of component)
  3. Be optimized for the query type: ${analysisData.queryType}
  4. Include appropriate time constraints if relevant (e.g., created >= startOfWeek() for "this week")
  5. Use proper field names and JQL syntax
  
  Output only the valid JQL query string, nothing else.`,
          [],
          {
            systemMessage:
              'You are an expert in generating precise Jira JQL queries. Always use "issue area (component)[dropdown]" instead of "component" when filtering by issue area.',
            model: "claude-3-7-sonnet-20250219",
            temperature: 0.1,
          }
        );

        // Only set jqlQuery after the await completes successfully
        jqlQuery = jqlGeneration.content.trim();
        console.log(`[JiraAgentService] Generated JQL query: ${jqlQuery}`);
      } catch (error) {
        console.error("[JiraAgentService] Error generating JQL query:", error);
        throw new Error(`Failed to generate JQL query: ${error.message}`);
      }

      // Step 2: Execute the JQL query against Jira
      let jiraResults = [];
      try {
        jiraResults = await jiraClient.searchIssues(jqlQuery);
        console.log(
          `[JiraAgentService] Found ${jiraResults.length} results from Jira`
        );
      } catch (error) {
        console.error("[JiraAgentService] Error executing JQL query:", error);
        throw new Error(`Failed to execute JQL query: ${error.message}`);
      }

      // Step 3: Generate visualization if needed
      if (analysisData.queryType === "visualization") {
        const visualType = analysisData.parameters?.visualType || "pie_chart";
        return this.handleVisualizationRequest(
          query,
          jiraResults,
          visualType,
          analysisData
        );
      }

      // Step 4: Format the results using Claude based on query type
      return this.formatResultsWithClaude(query, jiraResults, analysisData);
    } catch (error) {
      console.error(
        "[JiraAgentService] Error processing query with context:",
        error
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Handle responses to clarification requests
   */
  async handleClarificationResponse(
    originalQuery,
    clarificationResponse,
    chatHistory = []
  ) {
    try {
      console.log(
        `[JiraAgentService] Handling clarification response: "${clarificationResponse}" for query: "${originalQuery}"`
      );

      // Find the last message in chat history to determine what was asked
      const lastAssistantMessage = this.getLastAssistantMessage(chatHistory);

      // Extract context from history if available
      let storedContext = this.getStoredContext(chatHistory);
      if (!storedContext) {
        console.warn(
          "[JiraAgentService] No stored context found in chat history"
        );
        storedContext = {};
      }

      // Determine what type of clarification we were asking about
      let clarificationType = "unknown";

      if (lastAssistantMessage) {
        if (
          lastAssistantMessage.includes("Issue Area") ||
          lastAssistantMessage.includes("issue area")
        ) {
          clarificationType = "issue_area";
        } else if (
          lastAssistantMessage.includes("Project") ||
          lastAssistantMessage.includes("project")
        ) {
          clarificationType = "project";
        }
      } else if (storedContext.missingInfo) {
        clarificationType = storedContext.missingInfo;
      }

      console.log(
        `[JiraAgentService] Clarification type: ${clarificationType}`
      );

      // Update the context based on the clarification response
      if (clarificationType === "issue_area") {
        storedContext.issueArea = clarificationResponse;
        storedContext.hasIssueArea = true;
      } else if (clarificationType === "project") {
        storedContext.project = clarificationResponse;
        storedContext.hasProject = true;
      }

      // If we don't have queryType, try to infer it from the original query
      if (!storedContext.queryType) {
        // Quick analysis to determine query type
        const inferTypeQuery = await llmGatewayService.query(
          `What type of Jira query is this? "${originalQuery}"\nChoose one: ticket_summary, sentiment_analysis, top_issues, bug_report, language_issue, visualization, mttr, general`,
          [],
          {
            systemMessage:
              "You analyze Jira query types. Respond with just one word.",
            model: "claude-3-7-sonnet-20250219",
            temperature: 0,
          }
        );

        storedContext.queryType = inferTypeQuery.content.trim().toLowerCase();
      }

      console.log(
        `[JiraAgentService] Updated context after clarification:`,
        storedContext
      );

      // Process the query with the updated context
      return this.processQueryWithContext(
        originalQuery,
        {
          ...storedContext,
          hasIssueArea: Boolean(storedContext.issueArea),
          hasProject: Boolean(storedContext.project),
          needsClarification: false,
        },
        chatHistory
      );
    } catch (error) {
      console.error(
        "[JiraAgentService] Error handling clarification response:",
        error
      );
      return {
        success: false,
        error: error.message,
        formattedResponse: `<div class="search-results-container">
          <div class="search-content-wrapper">
            <div class="search-main-content error">
              <h3>Clarification Error</h3>
              <p>Sorry, there was an error processing your clarification: ${error.message}</p>
            </div>
          </div>
        </div>`,
      };
    }
  }

  /**
   * Helper function to get the last assistant message from chat history
   */
  getLastAssistantMessage(chatHistory) {
    if (
      !chatHistory ||
      !Array.isArray(chatHistory) ||
      chatHistory.length === 0
    ) {
      return null;
    }

    // Find the last assistant message
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msg = chatHistory[i];
      if (msg.role === "assistant" || (msg.gemini && !msg.user)) {
        return msg.message || msg.content || msg.gemini || "";
      }
    }

    return null;
  }

  /**
   * Helper function to extract stored context from chat history
   */
  getStoredContext(chatHistory) {
    if (!chatHistory || !Array.isArray(chatHistory)) return null;

    // Look for metadata entries
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msg = chatHistory[i];
      if (msg.role === "_metadata") {
        try {
          const data = JSON.parse(msg.message);
          if (data.metadata) {
            return data.metadata;
          }
        } catch (e) {
          console.warn("[JiraAgentService] Error parsing metadata:", e);
        }
      }
    }

    // Also check for frontend-style metadata in regular messages
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msg = chatHistory[i];
      if (msg.needs_user_input === true && msg.missing_info) {
        // Try to find the original query in nearby messages
        const userMsg = chatHistory
          .slice(Math.max(0, i - 2), i)
          .find((m) => m.role === "user" || m.user);

        if (userMsg) {
          return {
            originalQuery: userMsg.content || userMsg.user || "",
            missingInfo: msg.missing_info,
            queryType: null, // Will be inferred later
          };
        }
      }
    }

    return null;
  }

  /**
   * Calculate Mean Time To Resolution (MTTR) for a set of issues
   */
  async calculateMTTR(query, analysisData) {
    console.log(`[JiraAgentService] Calculating MTTR for query: "${query}"`);

    try {
      // Step 1: Generate JQL to find resolved issues
      const jqlGeneration = await llmGatewayService.query(
        `Generate a JQL query to find resolved issues for MTTR calculation:
        
        Query: "${query}"
        Issue Area: ${analysisData.issueArea || "Not specified"}
        Project: ${analysisData.project || "Not specified"}
        
        The JQL query must:
        1. Include project = "${
          analysisData.project || "ZSEE"
        }" if project is specified
        2. Include appropriate fields to filter by Issue Area: "${
          analysisData.issueArea
        }" if specified
        3. Only include resolved issues (status = Resolved OR status = Closed OR resolution IS NOT EMPTY)
        4. Include appropriate time constraints if mentioned in the query
        5. Use proper field names and JQL syntax
        
        Output only the valid JQL query string, nothing else.`,
        [],
        {
          systemMessage:
            "You are an expert in generating precise Jira JQL queries for MTTR analysis.",
          model: "claude-3-7-sonnet-20250219",
          temperature: 0.1,
        }
      );

      // Get the JQL query
      const jqlQuery = jqlGeneration.content.trim();
      console.log(`[JiraAgentService] Generated MTTR JQL query: ${jqlQuery}`);

      // Step 2: Execute the JQL query against Jira
      const jiraResults = await jiraClient.searchIssues(jqlQuery, 100);
      console.log(
        `[JiraAgentService] Found ${jiraResults.length} resolved issues for MTTR calculation`
      );

      // Step 3: Use Claude to calculate and format MTTR
      const resultsJson = JSON.stringify(jiraResults, null, 2);

      const mttrPrompt = `
        Calculate Mean Time To Resolution (MTTR) for these Jira issues:
        
        Issues: ${resultsJson}
        
        For each issue, calculate the time between created date and resolution date.
        Then calculate the average (mean) time to resolution across all issues.
        
        Also calculate MTTR by:
        - Priority (Critical, High, Medium, Low)
        - Component/Issue Area
        
        Format your response as a well-structured HTML analysis with these sections:
        - Overall MTTR
        - MTTR by Priority
        - MTTR by Component
        - MTTR Trend (if time data allows)
        - Outliers (issues with unusually long or short resolution times)
        
        Make it visually appealing with appropriate headings and formatting.
      `;

      const mttrResponse = await llmGatewayService.query(mttrPrompt, [], {
        systemMessage: `You are an expert in Jira metrics analysis.
          Always provide a comprehensive, well-formatted analysis.
          Use emoji where appropriate to make the response visually engaging.
          If there are no resolved issues, explain that MTTR cannot be calculated.`,
        model: "claude-3-7-sonnet-20250219",
        temperature: 0.3,
      });

      // Wrap the analysis in a search results container
      const formattedResponse = `
        <div class="search-results-container">
          <div class="search-content-wrapper">
            <div class="search-main-content">
              ${mttrResponse.content}
            </div>
          </div>
        </div>
      `;

      // Create sources for the Jira results
      const sources = jiraResults.slice(0, 5).map((issue) => ({
        title: `${issue.key}: ${issue.fields.summary}`,
        url: `${process.env.JIRA_API_URL}/browse/${issue.key}`,
        type: "jira",
        citationLabel: issue.key,
      }));

      return {
        success: true,
        formattedResponse,
        sources,
        result: {
          answer: mttrResponse.content,
          sources,
        },
      };
    } catch (error) {
      console.error(`[JiraAgentService] Error calculating MTTR:`, error);

      // Provide a fallback formatted response
      const fallbackResponse = `
        <div class="search-results-container">
          <div class="search-content-wrapper">
            <div class="search-main-content error">
              <h2>Error Calculating MTTR</h2>
              <p>Sorry, I couldn't calculate Mean Time To Resolution for your query.</p>
              <p>Error: ${error.message}</p>
            </div>
          </div>
        </div>
      `;

      return {
        success: false,
        formattedResponse: fallbackResponse,
        error: error.message,
      };
    }
  }
}

export default new JiraAgentService();
