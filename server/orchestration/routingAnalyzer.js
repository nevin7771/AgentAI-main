// server/orchestration/routingAnalyzer.js

/**
 * Analyzes a query to determine if it should be routed directly to Direct JIRA/Confluence API
 * instead of going through AI Studio first.
 *
 * @param {string} query - The user's original query
 * @param {string} targetSystem - Either "jira" or "confluence"
 * @returns {boolean} - True if the query should go directly to Direct API, false if it should go to AI Studio first
 */
const shouldRouteDirectlyToDirectAPI = (query, targetSystem) => {
  if (!query) return false;

  const queryLower = query.toLowerCase();

  // 1. Specific ticket searches - Direct to JIRA API
  if (targetSystem === "jira") {
    // Ticket ID pattern: PROJECT-1234 (e.g., ZSEE-12345, JIRA-789)
    const ticketIdPattern = /([a-z]+-\d+)/i;
    const hasTicketId = ticketIdPattern.test(queryLower);

    // Direct ticket fetches - these are specific enough to bypass AI Studio
    if (
      hasTicketId ||
      queryLower.includes("find ticket") ||
      queryLower.includes("search for ticket") ||
      queryLower.includes("get ticket") ||
      queryLower.includes("find issue") ||
      queryLower.includes("search for issue") ||
      queryLower.includes("look up ticket") ||
      queryLower.includes("show me ticket")
    ) {
      console.log(
        "[routingAnalyzer] Direct JIRA API routing: Query contains ticket-specific patterns"
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
  }

  // 2. Specific Confluence page searches
  if (targetSystem === "confluence") {
    // Looking for specific Confluence content
    const pageIdPattern = /page id:?\s*\d+/i;
    const hasPageId = pageIdPattern.test(queryLower);

    if (
      hasPageId ||
      queryLower.includes("find confluence page") ||
      queryLower.includes("get confluence page") ||
      queryLower.includes("search confluence for") ||
      queryLower.includes("latest version of page") ||
      queryLower.includes("recently updated pages")
    ) {
      console.log(
        "[routingAnalyzer] Direct Confluence API routing: Query contains specific page indicators"
      );
      return true;
    }

    // Space-specific queries
    if (
      (queryLower.includes("space") && queryLower.includes("key")) ||
      queryLower.includes("pages in space")
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

export { shouldRouteDirectlyToDirectAPI };
