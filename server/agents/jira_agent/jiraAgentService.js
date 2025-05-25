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

      // Fetch comments (last 5 for summarization)
      const comments = await jiraClient.fetchAllComments(ticketId);
      const lastFiveComments = comments.slice(0, 5);

      console.log(
        `[JiraAgentService] Found ${comments.length} comments, using last 5 for summary`
      );

      // Create enhanced summary with proper comment summarization
      const formattedResponse =
        await this.createTicketSummaryWithCommentSummary(
          ticket,
          lastFiveComments
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

  /**
   * CRITICAL FIX: Enhanced query processing with chat history support
   */
  async processQuery(query, chatHistory = [], options = {}) {
    console.log(`[JiraAgentService] Processing query: "${query}"`);
    console.log(
      `[JiraAgentService] Chat history length: ${chatHistory.length}`
    );

    try {
      // STEP 1: Check if user provided required information
      const missingInfo = this.checkRequiredInformation(query);
      if (missingInfo.needsClarification) {
        return {
          success: true,
          needsClarification: true,
          message: missingInfo.message,
          promptType: missingInfo.promptType,
          metadata: missingInfo.metadata,
        };
      }

      // STEP 2: Enhanced query analysis with better keyword extraction
      const analysisResult = await this.enhancedQueryAnalysis(
        query,
        chatHistory
      );
      console.log(`[JiraAgentService] Analysis result:`, analysisResult);

      // STEP 3: Generate multiple JQL queries with different keyword combinations
      const jqlQueries = await this.generateMultipleJQLQueries(analysisResult);
      console.log(
        `[JiraAgentService] Generated ${jqlQueries.length} JQL queries`
      );

      // STEP 4: Execute all queries concurrently
      const jiraResults = await this.executeMultipleQueries(jqlQueries);

      // STEP 5: Process results based on query intent
      const processedResult = await this.processResultsByIntent(
        query,
        analysisResult,
        jiraResults
      );

      return {
        success: true,
        formattedResponse: processedResult.response,
        sources: [], // No separate sources as requested
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
      console.error("[JiraAgentService] Error in processing:", error);
      return await this.enhancedFallbackProcessing(query, error);
    }
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
        "zoom ai",
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
                "Desktop Clients", // FIXED: Use proper field value
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
                "Web_Dashboard/Reports",
                "Web_Meetings/Webinars",
                "Zoom AI",
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
        "zoom ai",
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
              "Desktop Clients", // FIXED: Use proper field value
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
              "Web_Dashboard/Reports",
              "Web_Meetings/Webinars",
              "Zoom AI",
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

  /**
   * Enhanced query analysis with better keyword extraction
   */
  async enhancedQueryAnalysis(query, chatHistory = []) {
    console.log(`[JiraAgentService] Enhanced analysis for: "${query}"`);

    try {
      // Use Claude to understand time constraints and main keywords
      const analysisPrompt = `Analyze this Jira query and extract key information:

Query: "${query}"

Extract:
1. Main technical keywords (like "frameserverclient", "crash", "bug")  
2. Time constraints (recently = this week, this month, last month, etc.)
3. Query intent (search, analysis, visualization, etc.)
4. Issue area if mentioned (Desktop, Mobile, Web, etc.)

Respond with JSON:
{
  "mainKeywords": ["frameserverclient", "crash"],
  "alternativeKeywords": ["frame server client", "frame-server-client"],
  "timeConstraint": {"type": "relative", "value": "this_week", "days": 7},
  "queryType": "general_search",
  "issueArea": "Desktop Clients",
  "searchTerms": ["crash", "frameserverclient"],
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
   * Parse time constraints with Claude understanding
   */
  parseTimeConstraints(query) {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes("recently") || lowerQuery.includes("recent")) {
      return { type: "relative", value: "recently", days: 7 };
    }
    if (lowerQuery.includes("this week")) {
      return { type: "relative", value: "this_week", days: 7 };
    }
    if (lowerQuery.includes("this month")) {
      return { type: "relative", value: "this_month", days: 30 };
    }
    if (lowerQuery.includes("last month")) {
      return { type: "relative", value: "last_month", days: 60 };
    }
    if (lowerQuery.includes("last week")) {
      return { type: "relative", value: "last_week", days: 14 };
    }

    // Version-based time constraints
    const versionMatch = query.match(/(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      return { type: "version", value: `after_${versionMatch[1]}`, days: 90 };
    }

    return { type: "none", value: "", days: 7 };
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

    // FIXED: Predefined Issue Area components mapping with correct field values
    const issueAreaMapping = {
      // Direct matches - FIXED: Use actual Jira field values
      desktop: "Desktop Clients",
      "desktop client": "Desktop Clients",
      "desktop clients": "Desktop Clients",
      client: "Desktop Clients",
      clients: "Desktop Clients",

      streaming: "Live Streaming",
      "live streaming": "Live Streaming",
      stream: "Live Streaming",

      pwa: "PWA/WebClient",
      "web client": "PWA/WebClient",
      webclient: "PWA/WebClient",
      web: "PWA/WebClient",

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

      dashboard: "Web_Dashboard/Reports",
      reports: "Web_Dashboard/Reports",
      report: "Web_Dashboard/Reports",
      "web dashboard": "Web_Dashboard/Reports",

      meetings: "Web_Meetings/Webinars",
      webinar: "Web_Meetings/Webinars",
      webinars: "Web_Meetings/Webinars",
      meeting: "Web_Meetings/Webinars",

      ai: "Zoom AI",
      "zoom ai": "Zoom AI",
      "artificial intelligence": "Zoom AI",
    };

    // Direct keyword matching
    for (const [keyword, component] of Object.entries(issueAreaMapping)) {
      if (lowerQuery.includes(keyword)) {
        console.log(
          `[JiraAgentService] Found direct match: "${keyword}" -> "${component}"`
        );
        return {
          component: component,
          matchType: "direct",
          matchedKeyword: keyword,
        };
      }
    }

    // Smart matching using Claude for complex queries
    try {
      const componentList = [
        "Desktop Clients", // FIXED: Use actual field values
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
        "Web_Dashboard/Reports",
        "Web_Meetings/Webinars",
        "Zoom AI",
      ];

      const matchingPrompt = `Match this query to the most relevant Zoom component:

Query: "${query}"

Available components:
${componentList.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Instructions:
- If query mentions "frameserverclient" or similar client issues -> Desktop Clients
- If query mentions audio/sound/mic issues -> Audio  
- If query mentions video/camera issues -> Video
- If query mentions sharing/screen share -> Sharing
- If query mentions chat/messaging -> Chat
- If no clear match, return "none"

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

    // Fallback: Try to fetch available components from Jira and match
    try {
      const availableComponents = await this.fetchAvailableComponents();
      if (availableComponents.length > 0) {
        // Simple keyword matching against actual Jira components
        for (const component of availableComponents) {
          const componentLower = component.name.toLowerCase();
          const queryWords = lowerQuery.split(/\s+/);

          for (const word of queryWords) {
            if (word.length > 2 && componentLower.includes(word)) {
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
   * CRITICAL FIX: Generate multiple JQL queries with correct component field
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

    // Build time constraint
    let timeClause = "";
    if (analysis.timeConstraint?.type === "relative") {
      switch (analysis.timeConstraint.value) {
        case "recently":
        case "this_week":
          timeClause = "created >= -7d";
          break;
        case "this_month":
          timeClause = "created >= -30d";
          break;
        case "last_month":
          timeClause = "created >= -60d AND created <= -30d";
          break;
        case "last_week":
          timeClause = "created >= -14d AND created <= -7d";
          break;
        default:
          timeClause = `created >= -${analysis.timeConstraint.days}d`;
      }
    } else if (analysis.timeConstraint?.type === "version") {
      timeClause = `created >= -${analysis.timeConstraint.days}d`;
    }

    // CRITICAL FIX: Build component clause with correct field name
    let componentClause = "";
    if (analysis.issueArea?.component) {
      // FIXED: Use proper Jira field name for component
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

    // Query 1: Main keywords combined with all filters
    if (analysis.mainKeywords?.length > 0) {
      const mainTerms = analysis.mainKeywords.join(" ");
      let jqlParts = [baseProject, `text ~ "${mainTerms}"`];

      if (componentClause) jqlParts.push(componentClause);
      if (timeClause) jqlParts.push(timeClause);
      if (priorityClause) jqlParts.push(priorityClause);

      // Order by priority for top issues, otherwise by created date
      const orderBy =
        analysis.queryType === "top_issues"
          ? "ORDER BY priority DESC, created DESC"
          : "ORDER BY created DESC";

      queries.push({
        name: "main_keywords_with_filters",
        jql: jqlParts.join(" AND ") + " " + orderBy,
        maxResults: 15,
        purpose: `Search with main keywords and filters: ${mainTerms}${
          analysis.issueArea ? ` in ${analysis.issueArea.component}` : ""
        }`,
      });
    }

    // Query 2: Component-focused search (if component detected)
    if (analysis.issueArea?.component) {
      let jqlParts = [baseProject, componentClause];
      if (timeClause) jqlParts.push(timeClause);
      if (priorityClause) jqlParts.push(priorityClause);

      const orderBy =
        analysis.queryType === "top_issues"
          ? "ORDER BY priority DESC, created DESC"
          : "ORDER BY created DESC";

      queries.push({
        name: "component_focused",
        jql: jqlParts.join(" AND ") + " " + orderBy,
        maxResults: 15,
        purpose: `Component-focused search in ${analysis.issueArea.component}`,
      });
    }

    // Query 3: Individual keywords with filters
    if (analysis.mainKeywords?.length > 1) {
      analysis.mainKeywords.slice(0, 2).forEach((keyword, index) => {
        let jqlParts = [baseProject, `text ~ "${keyword}"`];
        if (componentClause) jqlParts.push(componentClause);
        if (timeClause) jqlParts.push(timeClause);
        if (priorityClause) jqlParts.push(priorityClause);

        const orderBy =
          analysis.queryType === "top_issues"
            ? "ORDER BY priority DESC, created DESC"
            : "ORDER BY priority DESC, created DESC";

        queries.push({
          name: `individual_${index}_with_filters`,
          jql: jqlParts.join(" AND ") + " " + orderBy,
          maxResults: 10,
          purpose: `Individual keyword search: ${keyword}${
            analysis.issueArea ? ` in ${analysis.issueArea.component}` : ""
          }`,
        });
      });
    }

    // Query 4: Alternative keyword combinations
    if (analysis.alternativeKeywords?.length > 0) {
      const altTerms = analysis.alternativeKeywords.slice(0, 2).join(" ");
      let jqlParts = [baseProject, `text ~ "${altTerms}"`];
      if (componentClause) jqlParts.push(componentClause);
      if (timeClause) jqlParts.push(timeClause);
      if (priorityClause) jqlParts.push(priorityClause);

      const orderBy =
        analysis.queryType === "top_issues"
          ? "ORDER BY priority DESC, created DESC"
          : "ORDER BY created DESC";

      queries.push({
        name: "alternatives_with_filters",
        jql: jqlParts.join(" AND ") + " " + orderBy,
        maxResults: 10,
        purpose: `Alternative keywords: ${altTerms}${
          analysis.issueArea ? ` in ${analysis.issueArea.component}` : ""
        }`,
      });
    }

    // Query 5: Broad search if specific searches might be too narrow
    if (queries.length > 0) {
      let jqlParts = [baseProject];
      if (componentClause) jqlParts.push(componentClause);
      if (timeClause) jqlParts.push(timeClause);
      if (priorityClause) jqlParts.push(priorityClause);

      // Add a general search term if we have keywords
      if (analysis.searchTerms?.length > 0) {
        const generalTerm = analysis.searchTerms[0];
        jqlParts.push(
          `(text ~ "${generalTerm}" OR summary ~ "${generalTerm}")`
        );
      }

      const orderBy =
        analysis.queryType === "top_issues"
          ? "ORDER BY priority DESC, created DESC"
          : "ORDER BY created DESC";

      queries.push({
        name: "broad_search",
        jql: jqlParts.join(" AND ") + " " + orderBy,
        maxResults: 10,
        purpose: `Broad search${
          analysis.issueArea ? ` in ${analysis.issueArea.component}` : ""
        }`,
      });
    }

    console.log(
      `[JiraAgentService] Generated ${queries.length} JQL queries:`,
      queries
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
   * Process sentiment analysis
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
      const ticketLink = `[${issue.key}](${process.env.JIRA_API_URL}/browse/${issue.key})`;
      response += `${index + 1}. ${ticketLink}: ${issue.fields?.summary}\n`;
      response += `   - Status: ${issue.fields?.status?.name}\n`;
      response += `   - Comments: ${issue.comments.length}\n\n`;
    });

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
   * Process MTTR analysis
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
      const ticketLink = `[${issue.key}](${process.env.JIRA_API_URL}/browse/${issue.key})`;
      response += `${index + 1}. ${ticketLink}: ${issue.summary}\n`;
      response += `   - Resolution Time: ${issue.resolutionDays} days\n\n`;
    });

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
   * Process general search
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
      const ticketLink = `[${issue.key}](${process.env.JIRA_API_URL}/browse/${issue.key})`;
      response += `## ${index + 1}. ${ticketLink}: ${
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
