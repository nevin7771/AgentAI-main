// server/clients/confluenceClient.js
// Updated to use environment variables

import axios from "axios";

// Fetch Confluence credentials from environment variables
const CONFLUENCE_URL = process.env.CONFLUENCE_API_URL; // e.g., https://your-domain.atlassian.net
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_API_EMAIL;
const CONFLUENCE_TOKEN = process.env.CONFLUENCE_API_TOKEN;

// Basic Authentication header value
const AUTH_TOKEN =
  CONFLUENCE_EMAIL && CONFLUENCE_TOKEN
    ? `Basic ${Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_TOKEN}`).toString(
        "base64"
      )}`
    : null;

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
    // Return an empty array or an error indicator
    return [];
    // Or throw new Error("Confluence API credentials not configured.");
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

    const formattedResults = pages.map((page) => ({
      title: page.title,
      // Extracting summary from body might need adjustment based on actual content format
      summary:
        page.body?.view?.value?.replace(/<[^>]*>/g, " ").substring(0, 500) +
          "..." ||
        page.excerpt ||
        page.title,
      url: `${CONFLUENCE_URL}${page._links?.webui || "/wiki/" + page.id}`,
      search_engine: "Confluence Direct API",
      chunks: [page.body?.view?.value?.replace(/<[^>]*>/g, " ") || ""], // Full body as a chunk
      extra: {
        id: page.id,
        type: page.type,
        status: page.status,
        space: page.space?.key,
        version: page.version?.number,
        lastModified: page.version?.when,
      },
    }));

    return formattedResults;
  } catch (error) {
    console.error(
      "[confluenceClient] Error searching Confluence:",
      error.response?.data || error.message
    );
    // Return an error indicator or throw
    // Example: return [{ source: "confluence_direct", error: error.message }];
    throw new Error(`Failed to search Confluence: ${error.message}`);
  }
};

export default {
  searchPages,
};
