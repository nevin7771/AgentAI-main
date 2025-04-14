// server/agents/utils/agentUtils.js
// Shared utility functions for agents

import fetch from "node-fetch";

/**
 * Performs a web search using a search API
 * @param {string} query - The search query
 * @param {Array<string>} domains - Optional array of domains to restrict search to
 * @param {number} limit - Maximum number of results to return
 * @returns {Promise<Array>} - Array of search results
 */
export const performWebSearch = async (query, domains = [], limit = 5) => {
  try {
    // In a production environment, you would integrate with a real search API
    // such as Google Custom Search, SerpAPI, or Bing Search API

    // For example with SerpAPI (you would need your own API key):
    // const apiKey = process.env.SERP_API_KEY;
    // const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=${limit}&api_key=${apiKey}`;
    // if (domains.length > 0) {
    //   url += `&sites=${domains.join(',')}`;
    // }

    // For now, we'll return simulated results
    console.log(`[WebSearch] Performing search for: "${query}"`);
    if (domains.length > 0) {
      console.log(`[WebSearch] Restricted to domains: ${domains.join(", ")}`);
    }

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return simulateSearchResults(query, domains, limit);
  } catch (error) {
    console.error("[WebSearch] Error:", error);
    throw new Error(`Search failed: ${error.message}`);
  }
};

/**
 * Fetches content from a web page
 * @param {string} url - The URL to fetch
 * @returns {Promise<string>} - The page content
 */
export const fetchWebContent = async (url) => {
  try {
    console.log(`[WebFetch] Fetching content from: ${url}`);

    // In a production environment, you would actually fetch the page
    // const response = await fetch(url);
    // if (!response.ok) {
    //   throw new Error(`HTTP error! Status: ${response.status}`);
    // }
    // const html = await response.text();
    // return extractMainContent(html);

    // For now, return simulated content
    await new Promise((resolve) => setTimeout(resolve, 800));
    return simulatePageContent(url);
  } catch (error) {
    console.error("[WebFetch] Error:", error);
    throw new Error(`Failed to fetch content: ${error.message}`);
  }
};

/**
 * Summarizes a text using the OpenAI API
 * @param {string} text - The text to summarize
 * @param {object} openai - The OpenAI client instance
 * @returns {Promise<string>} - The summarized text
 */
export const summarizeText = async (text, openai) => {
  try {
    console.log("[Summarize] Summarizing text of length:", text.length);

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes text. Create a concise summary that captures the key points.",
        },
        {
          role: "user",
          content: `Please summarize the following text:\n\n${text}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 300,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("[Summarize] Error:", error);
    throw new Error(`Summarization failed: ${error.message}`);
  }
};

// Helper functions for simulation

/**
 * Simulates search results for testing
 * @private
 */
function simulateSearchResults(query, domains = [], limit = 5) {
  const results = [];

  // Generate simulated search results
  for (let i = 0; i < limit; i++) {
    const domain =
      domains.length > 0 ? domains[i % domains.length] : `example${i}.com`;

    results.push({
      title: `${query} - Result ${i + 1} from ${domain}`,
      link: `https://${domain}/search?q=${encodeURIComponent(query)}&result=${
        i + 1
      }`,
      snippet: `This is a simulated search result about ${query}. This would contain a snippet of text from the page that matches the search query.`,
      source: domain,
    });
  }

  return results;
}

/**
 * Simulates page content for testing
 * @private
 */
function simulatePageContent(url) {
  // Extract domain from URL
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch (e) {
    domain = "example.com";
  }

  // Generate different content based on the domain
  if (domain.includes("support")) {
    return `
      <h1>Support Documentation</h1>
      <p>This is simulated content from a support page on ${domain}.</p>
      <h2>Troubleshooting Steps</h2>
      <ol>
        <li>Check your network connection</li>
        <li>Restart the application</li>
        <li>Clear your cache</li>
        <li>Update to the latest version</li>
      </ol>
      <p>If you continue to experience issues, please contact our support team.</p>
    `;
  } else if (domain.includes("community")) {
    return `
      <h1>Community Discussion</h1>
      <p>This is simulated content from a community forum on ${domain}.</p>
      <div class="post">
        <h3>User123</h3>
        <p>I've been having this issue for a while now. Has anyone found a solution?</p>
      </div>
      <div class="post">
        <h3>ExpertUser</h3>
        <p>I encountered this same problem and found that updating the configuration file fixed it for me.</p>
      </div>
      <div class="post">
        <h3>Moderator</h3>
        <p>This issue is known and will be fixed in the next release. As a workaround, you can try...</p>
      </div>
    `;
  } else {
    return `
      <h1>Product Information</h1>
      <p>This is simulated content from the main website on ${domain}.</p>
      <h2>Features</h2>
      <ul>
        <li>Feature 1: Description of feature 1</li>
        <li>Feature 2: Description of feature 2</li>
        <li>Feature 3: Description of feature 3</li>
      </ul>
      <h2>System Requirements</h2>
      <p>The application requires the following system specifications:</p>
      <ul>
        <li>Operating System: Windows 10, macOS 10.15+, or Linux</li>
        <li>RAM: 8GB minimum</li>
        <li>Storage: 1GB available space</li>
      </ul>
    `;
  }
}

/**
 * Extracts the main content from HTML (simplified version)
 * @private
 */
function extractMainContent(html) {
  // In a real implementation, you would use a library like Cheerio or JSDOM
  // to parse the HTML and extract the main content

  // This is a very simplified version
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return html;

  // Remove scripts, styles, and common navigation elements
  let content = bodyMatch[1]
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "");

  // Remove HTML tags
  content = content.replace(/<[^>]*>/g, " ");

  // Normalize whitespace
  content = content.replace(/\s+/g, " ").trim();

  return content;
}
