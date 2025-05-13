// server/clients/confluenceClient.js
// Updated to use environment variables and return consistent response format

import axios from "axios";

// Fetch Confluence credentials from environment variables
const CONFLUENCE_URL = process.env.CONFLUENCE_API_URL; // e.g., https://your-domain.atlassian.net
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_API_EMAIL;
const CONFLUENCE_TOKEN = process.env.CONFLUENCE_API_TOKEN;

// Log configuration status for debugging
console.log("[confluenceClient] Configuration:");
console.log(
  `[confluenceClient] CONFLUENCE_URL: ${CONFLUENCE_URL || "Not configured"}`
);
console.log(
  `[confluenceClient] CONFLUENCE_EMAIL: ${
    CONFLUENCE_EMAIL
      ? `${CONFLUENCE_EMAIL.substring(0, 3)}...`
      : "Not configured"
  }`
);
console.log(
  `[confluenceClient] CONFLUENCE_TOKEN: ${
    CONFLUENCE_TOKEN ? "Configured" : "Not configured"
  }`
);

// Basic Authentication header value
const AUTH_TOKEN =
  CONFLUENCE_EMAIL && CONFLUENCE_TOKEN
    ? `Basic ${Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_TOKEN}`).toString(
        "base64"
      )}`
    : null;

console.log(
  `[confluenceClient] Auth token generated: ${AUTH_TOKEN ? "Yes" : "No"}`
);

/**
 * Searches Confluence pages based on a query using CQL.
 *
 * @param {string} query - The search query.
 * @param {number} maxResults - Maximum number of pages to return.
 * @returns {Promise<Array<object>>} - A promise resolving to an array of Confluence page objects (simplified).
 */
const searchPages = async (query, maxResults = 5) => {
  if (!CONFLUENCE_URL || !AUTH_TOKEN) {
    console.warn(
      "[confluenceClient] Confluence URL, Email, or Token not configured in .env. Skipping Confluence search."
    );
    // Return a formatted error response
    return formatResultsForFrontend(
      [
        {
          title: "Confluence API Error",
          summary: "Confluence API credentials not configured properly.",
          url: null,
          search_engine: "Confluence Direct API",
          error: true,
          extra: {
            error_type: "configuration",
            details: "Missing Confluence API credentials.",
          },
        },
      ],
      query
    );
  }

  console.log(`[confluenceClient] Searching Confluence for: "${query}"`);

  try {
    // Construct CQL query (searching text)
    // More complex CQL can be generated if needed, similar to JQL
    const cql = `siteSearch ~ "${query.replace(
      /"/g,
      '\\"'
    )}" order by lastModified desc`;
    console.log(`[confluenceClient] Using CQL: ${cql}`);

    // Call the Confluence Search API (using v1 for broader search)
    // Note: Confluence Cloud API might have different endpoints/versions
    const searchUrl = `${CONFLUENCE_URL}/rest/api/content/search`;

    const response = await axios.get(searchUrl, {
      headers: {
        Authorization: AUTH_TOKEN,
        Accept: "application/json",
      },
      params: {
        cql: cql,
        limit: maxResults,
        expand: "body.view,version,space", // Expand to get body content, version, and space info
      },
      timeout: 15000, // 15 seconds timeout
    });

    // Format the results
    const pages = response.data?.results || [];
    console.log(`[confluenceClient] Found ${pages.length} pages.`);

    const formattedResults = pages.map((page) => {
      // Extract content safely
      const content = page.body?.view?.value || "";

      // Clean HTML content to get plain text - basic approach
      const plainTextContent = content.replace(/<[^>]*>/g, " ").trim();

      // Get a reasonable summary length
      const summary =
        plainTextContent.length > 500
          ? plainTextContent.substring(0, 500) + "..."
          : plainTextContent;

      return {
        title: page.title || "Untitled Page",
        summary: summary || page.excerpt || page.title,
        url: `${CONFLUENCE_URL}${page._links?.webui || "/wiki/" + page.id}`,
        search_engine: "Confluence Direct API",
        chunks: [plainTextContent || ""], // Full body as a chunk
        extra: {
          id: page.id,
          type: page.type,
          status: page.status,
          space: page.space?.key,
          spaceName: page.space?.name,
          version: page.version?.number,
          lastModified: page.version?.when,
          creator: page.history?.createdBy?.displayName || "Unknown",
          lastUpdater: page.history?.lastUpdated?.by?.displayName || "Unknown",
        },
      };
    });

    // Format the results for frontend before returning
    return formatResultsForFrontend(formattedResults, query);
  } catch (error) {
    console.error(
      "[confluenceClient] Error searching Confluence:",
      error.response?.data || error.message
    );

    // Check if it's an authentication error
    let errorItem;
    if (error.response?.status === 401) {
      console.error(
        "[confluenceClient] Authentication failed. Check Confluence credentials."
      );
      errorItem = {
        title: "Confluence Authentication Error",
        summary:
          "Failed to authenticate with Confluence API. Please check your credentials.",
        url: null,
        search_engine: "Confluence Direct API",
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
        title: "Confluence Search Error",
        summary: `Failed to search Confluence: ${error.message}`,
        url: null,
        search_engine: "Confluence Direct API",
        error: true,
        extra: {
          error_type: "search",
          details: error.response?.data || error.message,
        },
      };
    }

    // Return a formatted error that can be displayed
    return formatResultsForFrontend([errorItem], query);
  }
};

/**
 * Fetches a specific Confluence page by ID.
 *
 * @param {string} pageId - The Confluence page ID.
 * @returns {Promise<object>} - A promise resolving to a page object (simplified).
 */
const getPageById = async (pageId) => {
  if (!CONFLUENCE_URL || !AUTH_TOKEN) {
    console.warn(
      "[confluenceClient] Confluence API not configured. Cannot fetch page."
    );
    return {
      error: true,
      summary: "Confluence API credentials not configured properly.",
    };
  }

  try {
    console.log(`[confluenceClient] Fetching Confluence page by ID: ${pageId}`);
    const pageUrl = `${CONFLUENCE_URL}/rest/api/content/${pageId}`;
    const response = await axios.get(pageUrl, {
      headers: {
        Authorization: AUTH_TOKEN,
        Accept: "application/json",
      },
      params: {
        expand: "body.view,version,space",
      },
    });

    const page = response.data;
    if (!page) {
      return {
        error: true,
        summary: `No page found with ID: ${pageId}`,
      };
    }

    // Extract and clean content
    const content = page.body?.view?.value || "";
    const plainTextContent = content.replace(/<[^>]*>/g, " ").trim();

    return {
      title: page.title,
      summary:
        plainTextContent.substring(0, 500) +
        (plainTextContent.length > 500 ? "..." : ""),
      url: `${CONFLUENCE_URL}${page._links?.webui || "/wiki/" + page.id}`,
      content: plainTextContent,
      extra: {
        id: page.id,
        type: page.type,
        space: page.space?.key,
        spaceName: page.space?.name,
        version: page.version?.number,
        lastModified: page.version?.when,
      },
      // IMPORTANT: Include the result structure for frontend compatibility
      result: {
        answer: `# ${page.title}\n\n${plainTextContent.substring(0, 2000)}${
          plainTextContent.length > 2000 ? "..." : ""
        }`,
        sources: [
          {
            title: page.title,
            url: `${CONFLUENCE_URL}${page._links?.webui || "/wiki/" + page.id}`,
            snippet: plainTextContent.substring(0, 200) + "...",
          },
        ],
      },
    };
  } catch (error) {
    console.error(
      `[confluenceClient] Error fetching page ${pageId}:`,
      error.response?.data || error.message
    );
    return {
      error: true,
      summary: `Failed to fetch page: ${error.message}`,
      // Include result structure for frontend compatibility
      result: {
        answer: `Error fetching Confluence page ${pageId}: ${error.message}`,
        sources: [],
      },
    };
  }
};

/**
 * Formats the search results to ensure they are compatible with the frontend expectations.
 * This should be called at the end of searchPages to standardize responses.
 *
 * @param {Array} results - The raw search results
 * @param {string} query - The original search query
 * @returns {Array} - Formatted results with consistent structure
 */
const formatResultsForFrontend = (results, query) => {
  console.log(
    `[confluenceClient] Formatting ${results.length} results for frontend display`
  );

  if (!results || results.length === 0) {
    // Return a standardized empty result
    const emptyResult = [
      {
        title: "No Confluence results found",
        summary: `No matching Confluence pages found for "${query}"`,
        url: null,
        search_engine: "Confluence Direct API",
        result: {
          answer: `No matching Confluence pages were found for "${query}". Try refining your search or checking for typos.`,
          sources: [],
        },
      },
    ];
    console.log(`[confluenceClient] Returning empty result format`);
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
    console.log(`[confluenceClient] Returning error result format`);
    return errorResult;
  }

  // Create a combined answer from multiple results
  let combinedAnswer = `Found ${results.length} Confluence page${
    results.length > 1 ? "s" : ""
  } for "${query}":\n\n`;

  results.forEach((item, index) => {
    combinedAnswer += `${index + 1}. **${item.title || "Untitled"}**\n`;
    if (item.summary) {
      // Limit summary length in the combined answer
      const shortenedSummary =
        item.summary.length > 150
          ? item.summary.substring(0, 150) + "..."
          : item.summary;
      combinedAnswer += `   ${shortenedSummary}\n`;
    }
    if (item.url) {
      combinedAnswer += `   [View in Confluence](${item.url})\n`;
    }
    if (item.extra && item.extra.spaceName) {
      combinedAnswer += `   Space: ${item.extra.spaceName}\n`;
    }
    if (item.extra && item.extra.lastModified) {
      // Format date nicely if available
      try {
        const lastModified = new Date(item.extra.lastModified);
        combinedAnswer += `   Last modified: ${lastModified.toLocaleDateString()}\n`;
      } catch (e) {
        combinedAnswer += `   Last modified: ${item.extra.lastModified}\n`;
      }
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
    `[confluenceClient] Returning ${enhancedResults.length} enhanced results`
  );
  return enhancedResults;
};

export default {
  searchPages,
  getPageById,
  formatResultsForFrontend,
};
