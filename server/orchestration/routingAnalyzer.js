// server/orchestration/routingAnalyzer.js
// Enhanced version with improved follow-up handling and context restoration

/**
 * Analyzes a query to determine if it should be routed directly to Direct JIRA/Confluence API
 * instead of going through AI Studio first.
 *
 * @param {string} query - The user's original query
 * @param {string} targetSystem - Either "jira" or "confluence"
 * @param {Array} chatHistory - Optional conversation history for context awareness
 * @returns {boolean} - True if the query should go directly to Direct API, false if it should go to AI Studio first
 */
const shouldRouteDirectlyToDirectAPI = (
  query,
  targetSystem,
  chatHistory = []
) => {
  if (!query) return false;

  const queryLower = query.toLowerCase();

  // Check if this is a follow-up to a clarification question from the agent
  const isFollowUpToClarification = checkForClarificationFollowUp(
    query,
    chatHistory
  );
  if (isFollowUpToClarification) {
    console.log(
      "[routingAnalyzer] Detected follow-up to clarification question"
    );

    // Get the last assistant message (clarification request)
    const lastAssistantMessage = getLastAssistantMessage(chatHistory);

    // Check for specific clarification types that should always go to Direct API
    if (
      lastAssistantMessage &&
      (lastAssistantMessage.includes("Issue Area") ||
        lastAssistantMessage.includes("Which project") ||
        lastAssistantMessage.includes("Which Jira ticket") ||
        lastAssistantMessage.includes("Which user") ||
        lastAssistantMessage.includes("Which client") ||
        lastAssistantMessage.includes("Which release"))
    ) {
      // Look for original query context in metadata to make better routing decisions
      const originalQueryContext =
        extractOriginalQueryFromMetadata(chatHistory);

      if (originalQueryContext) {
        const originalQueryLower =
          originalQueryContext.originalQuery.toLowerCase();

        // If original query had analytical keywords, this should definitely go to Direct API
        if (
          originalQueryLower.includes("top") ||
          originalQueryLower.includes("mttr") ||
          originalQueryLower.includes("sentiment") ||
          originalQueryLower.includes("bug list") ||
          originalQueryLower.includes("chart") ||
          (originalQueryLower.includes("issue") &&
            originalQueryLower.includes("this week"))
        ) {
          console.log(
            "[routingAnalyzer] Original query contained analytical keywords, routing to Direct API"
          );
          return true;
        }
      }

      // Even without original context, follow-up responses to these clarifications
      // should usually go to Direct API
      console.log(
        "[routingAnalyzer] Follow-up to clarification - routing to Direct API"
      );
      return true;
    }
  }

  // 1. Specific ticket searches - Direct to JIRA API
  if (targetSystem === "jira") {
    // Ticket ID pattern: PROJECT-1234 (e.g., ZSEE-12345, JIRA-789)
    const ticketIdPattern = /([a-z]+-\d+)/i;
    const hasTicketId = ticketIdPattern.test(queryLower);

    // Search indicators - looking for specific search intent phrases
    const searchIndicators = [
      "search in jira",
      "search jira",
      "find in jira",
      "find jira",
      "look up jira",
      "jira issues",
      "jira tickets",
      "check jira",
      "find tickets",
      "search for tickets",
      "find issues",
      "search for issues",
      "list jira",
      "show jira",
      "get jira",
      "any jira",
      "any tickets",
      "any issues",
      "related to",
      "about",
    ];

    const hasSearchIndicator = searchIndicators.some((indicator) =>
      queryLower.includes(indicator)
    );

    // Analytics indicators - these suggest specialized queries that should go to Direct API
    const analyticsIndicators = [
      "mttr",
      "mean time to resolution",
      "average resolution time",
      "top 10",
      "top issue",
      "most common",
      "highest priority",
      "bug list",
      "bugs reported",
      "reported bugs",
      "generate chart",
      "create table",
      "visualize",
      "pie chart",
      "bar chart",
      "sentiment analysis",
      "sentiment of",
      "feeling of",
    ];

    const hasAnalyticsIndicator = analyticsIndicators.some((indicator) =>
      queryLower.includes(indicator)
    );

    // Specific topics that should be searched directly
    const directTopics = [
      "ai summary",
      "summary language",
      "meeting summary",
      "transcript",
      "incorrect language",
      "wrong language",
      "language issue",
      "audio",
      "video",
      "not working",
      "error",
      "bug",
      "failing",
      "broken",
      "desktop client",
    ];

    const hasDirectTopic = directTopics.some((topic) =>
      queryLower.includes(topic)
    );

    // Detect project/issue area names in follow-up responses
    // This handles cases where the user just responds with a project name after being asked
    const isProjectNameResponse = isPossibleProjectNameResponse(
      query,
      chatHistory
    );
    if (isProjectNameResponse) {
      console.log(
        "[routingAnalyzer] Detected project name in follow-up response, routing to Direct API"
      );
      return true;
    }

    // Handle case where query looks like just a project name or issue area after clarification
    const mightBeJustProjectName =
      /^[a-z0-9\s]+$/i.test(query.trim()) &&
      query.trim().split(/\s+/).length <= 3;
    if (
      mightBeJustProjectName &&
      wasPreviousMessageClarificationRequest(chatHistory)
    ) {
      console.log(
        "[routingAnalyzer] Query appears to be just a project/area name after clarification, routing to Direct API"
      );
      return true;
    }

    // Ticket-specific verbs indicating direct access
    if (
      hasTicketId ||
      hasSearchIndicator ||
      hasAnalyticsIndicator ||
      (hasDirectTopic &&
        (queryLower.includes("jira") ||
          queryLower.includes("ticket") ||
          queryLower.includes("issue"))) ||
      queryLower.includes("find ticket") ||
      queryLower.includes("search for ticket") ||
      queryLower.includes("get ticket") ||
      queryLower.includes("find issue") ||
      queryLower.includes("search for issue") ||
      queryLower.includes("look up ticket") ||
      queryLower.includes("show me ticket") ||
      // Additional patterns for finding/listing multiple tickets
      queryLower.includes("list all tickets") ||
      queryLower.includes("show all issues") ||
      queryLower.includes("find all jira") ||
      queryLower.includes("get all tickets") ||
      // Patterns for status checking
      (queryLower.includes("status") &&
        (queryLower.includes("ticket") || queryLower.includes("jira"))) ||
      (queryLower.includes("assignee") &&
        (queryLower.includes("ticket") || queryLower.includes("jira"))) ||
      // MTTR related queries
      queryLower.includes("mttr") ||
      (queryLower.includes("mean time") && queryLower.includes("resolution")) ||
      // Top N queries
      (queryLower.includes("top") &&
        (queryLower.includes("issue") || queryLower.includes("ticket"))) ||
      // Bug related queries
      (queryLower.includes("bug") &&
        (queryLower.includes("list") || queryLower.includes("reported"))) ||
      // Visualization queries
      queryLower.includes("chart") ||
      queryLower.includes("pie") ||
      queryLower.includes("graph") ||
      queryLower.includes("table") ||
      queryLower.includes("visualize") ||
      queryLower.includes("summarize") ||
      // Sentiment analysis queries
      queryLower.includes("sentiment") ||
      ((queryLower.includes("feeling") ||
        queryLower.includes("emotion") ||
        queryLower.includes("tone")) &&
        (queryLower.includes("ticket") ||
          queryLower.includes("issue") ||
          hasTicketId))
    ) {
      console.log(
        "[routingAnalyzer] Direct JIRA API routing: Query contains ticket-specific patterns or analytics indicators"
      );
      return true;
    }

    // AI Summary language specific pattern detection
    if (isAiSummaryLanguageQuery(queryLower)) {
      console.log(
        "[routingAnalyzer] Direct JIRA API routing: Query is specifically about AI summary language issues"
      );
      return true;
    }

    // JQL-like queries that are better handled by direct API
    if (
      queryLower.includes("created after") ||
      queryLower.includes("updated after") ||
      queryLower.includes("created before") ||
      queryLower.includes("updated before") ||
      queryLower.includes("created by") ||
      queryLower.includes("assigned to") ||
      queryLower.includes("priority =") ||
      queryLower.includes("status =") ||
      (queryLower.includes("project") && queryLower.includes("="))
    ) {
      console.log(
        "[routingAnalyzer] Direct JIRA API routing: Query contains JQL-like patterns"
      );
      return true;
    }

    // Looking for specific comments or attachments
    if (
      queryLower.includes("comments on") ||
      queryLower.includes("attachments for") ||
      queryLower.includes("files attached to")
    ) {
      console.log(
        "[routingAnalyzer] Direct JIRA API routing: Query asks for specific issue components"
      );
      return true;
    }

    // If query contains both search intent AND a specific topic, route directly
    if (hasSearchIndicator && hasDirectTopic) {
      console.log(
        "[routingAnalyzer] Direct JIRA API routing: Query combines search intent with specific topic"
      );
      return true;
    }
  }

  // 2. Specific Confluence page searches
  if (targetSystem === "confluence") {
    // Looking for specific Confluence content
    const pageIdPattern = /page id:?\s*\d+/i;
    const hasPageId = pageIdPattern.test(queryLower);

    // Search indicators for Confluence
    const searchIndicators = [
      "search in confluence",
      "search confluence",
      "find in confluence",
      "find confluence",
      "look up confluence",
      "confluence pages",
      "confluence documents",
      "check confluence",
      "find pages",
      "search for pages",
      "list confluence",
      "show confluence",
      "get confluence",
      "any confluence",
      "any pages",
      "any documents",
    ];

    const hasSearchIndicator = searchIndicators.some((indicator) =>
      queryLower.includes(indicator)
    );

    if (
      hasPageId ||
      hasSearchIndicator ||
      queryLower.includes("find confluence page") ||
      queryLower.includes("get confluence page") ||
      queryLower.includes("search confluence for") ||
      queryLower.includes("latest version of page") ||
      queryLower.includes("recently updated pages") ||
      queryLower.includes("find all pages") ||
      queryLower.includes("list all pages") ||
      queryLower.includes("show all pages") ||
      queryLower.includes("get all documents")
    ) {
      console.log(
        "[routingAnalyzer] Direct Confluence API routing: Query contains specific page indicators"
      );
      return true;
    }

    // Space-specific queries
    if (
      (queryLower.includes("space") && queryLower.includes("key")) ||
      queryLower.includes("pages in space") ||
      queryLower.includes("documents in space")
    ) {
      console.log(
        "[routingAnalyzer] Direct Confluence API routing: Query targets specific spaces"
      );
      return true;
    }
  }

  // 3. Direct metadata searches (both systems)
  if (
    queryLower.includes("created in the last") ||
    queryLower.includes("updated in the last") ||
    queryLower.includes("modified since") ||
    queryLower.includes("created since") ||
    queryLower.includes("list all")
  ) {
    console.log(
      "[routingAnalyzer] Direct API routing: Query focuses on metadata search"
    );
    return true;
  }

  // 4. Complex relationship or aggregation queries for AI Studio
  // If the query involves interpretation, summaries, or explanations,
  // it's better to let AI Studio handle it first
  if (
    queryLower.includes("summarize") ||
    queryLower.includes("explain") ||
    queryLower.includes("what is the status of") ||
    queryLower.includes("tell me about") ||
    queryLower.includes("why is") ||
    queryLower.includes("provide context") ||
    queryLower.includes("help me understand")
  ) {
    console.log(
      "[routingAnalyzer] AI Studio routing: Query requires interpretation/summarization"
    );
    return false;
  }

  // By default, route to AI Studio first for most queries
  return false;
};

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
 * Determines if the current query is a follow-up to a clarification request
 *
 * @param {string} query - The current query
 * @param {Array} chatHistory - The conversation history array
 * @returns {boolean} - True if this appears to be a follow-up to a clarification
 */
function checkForClarificationFollowUp(query, chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
    return false;
  }

  // Get the last assistant message
  const lastAssistantMsg = getLastAssistantMessage(chatHistory);
  if (!lastAssistantMsg) return false;

  // Common clarification questions the assistant might ask
  const clarificationPhrases = [
    "Which Issue Area",
    "Which specific Jira ticket",
    "Which project would you like",
    "Which user would you like",
    "provide more details",
    "Which client would you",
    "Which release or version",
  ];

  // Check if the last assistant message contained a clarification request
  const containsClarificationRequest = clarificationPhrases.some((phrase) =>
    lastAssistantMsg.includes(phrase)
  );

  // If last message was a clarification request, and current query is short (likely a direct answer)
  // or looks like a project/area name response
  if (
    containsClarificationRequest &&
    (query.length < 30 || isPossibleProjectNameResponse(query, chatHistory))
  ) {
    return true;
  }

  return false;
}

/**
 * Gets the last assistant message from chat history
 *
 * @param {Array} chatHistory - The conversation history
 * @returns {string|null} - The last assistant message or null if not found
 */
function getLastAssistantMessage(chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
    return null;
  }

  // Look for the last assistant message
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "assistant") {
      return chatHistory[i].message;
    }
  }

  return null;
}

/**
 * Extracts original query information from metadata in chat history
 *
 * @param {Array} chatHistory - The conversation history
 * @returns {object|null} - Original query context or null if not found
 */
function extractOriginalQueryFromMetadata(chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory)) return null;

  // Look for metadata entries
  for (let i = chatHistory.length - 1; i >= 0; i--) {
    if (chatHistory[i].role === "_metadata") {
      try {
        const data = JSON.parse(chatHistory[i].message);
        if (data.metadata && data.metadata.originalQuery) {
          return {
            originalQuery: data.metadata.originalQuery,
            missingInfo: data.metadata.missingInfo,
            intentType: data.metadata.intentType,
          };
        }
      } catch (e) {
        console.warn("[routingAnalyzer] Error parsing metadata:", e);
      }
    }
  }

  return null;
}

/**
 * Checks if the user's query appears to be just a project name response after a clarification
 *
 * @param {string} query - The current query
 * @param {Array} chatHistory - The conversation history array
 * @returns {boolean} - True if this appears to be a project name response
 */
function isPossibleProjectNameResponse(query, chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
    return false;
  }

  // If this query is more than 3 words, it's probably not just a project name
  const words = query.trim().split(/\s+/);
  if (words.length > 3) return false;

  // Common project name patterns
  const projectNamePattern = /^[a-z0-9\s]+$/i;
  const isSimpleProjectName = projectNamePattern.test(query.trim());

  if (!isSimpleProjectName) return false;

  // Check if the last assistant message was asking about a project
  return wasPreviousMessageClarificationRequest(chatHistory);
}

/**
 * Checks if the previous assistant message was a clarification request
 *
 * @param {Array} chatHistory - The conversation history
 * @returns {boolean} - True if the last assistant message was asking for clarification
 */
function wasPreviousMessageClarificationRequest(chatHistory) {
  if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
    return false;
  }

  // Find last assistant message
  const lastAssistantMessage = getLastAssistantMessage(chatHistory);

  if (!lastAssistantMessage) return false;

  const clarificationPhrases = [
    "Which Issue Area",
    "Which project",
    "Which Jira ticket",
    "Which client",
    "Which release",
    "Which user",
  ];

  return clarificationPhrases.some((phrase) =>
    lastAssistantMessage.includes(phrase)
  );
}

export { shouldRouteDirectlyToDirectAPI };
