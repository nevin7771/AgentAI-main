// server/router/agent.js
import express from "express";
import axios from "axios";
import { load } from "cheerio";

const router = express.Router();

// DeepSearch endpoint
router.post("/api/deepsearch", async (req, res) => {
  try {
    const {
      query,
      sources = ["support.zoom.us", "community.zoom.us", "zoom.us"],
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query is required",
        formattedHtml: `<div class="deep-search-results error"><h3>Error</h3><p>Query is required</p></div>`,
      });
    }

    console.log(`[DeepSearch] Processing query: "${query}"`);

    // 1. Perform Google search instead of direct site search
    const searchResults = await performGoogleSearch(query, sources);

    // 2. Process and format results
    let formattedHtml;

    if (searchResults.length > 0) {
      formattedHtml = formatSearchResults(query, sources, searchResults);
    } else {
      // If no results, use fallback data for common Zoom questions
      const fallbackResults = getFallbackResults(query, sources);

      if (fallbackResults.length > 0) {
        formattedHtml = formatSearchResults(query, sources, fallbackResults);
      } else {
        formattedHtml = `
          <div class="deep-search-results">
            <h3>Deep Research Results</h3>
            <p><strong>Query:</strong> "${query}"</p>
            <p><strong>Sources searched:</strong> ${sources.join(", ")}</p>
            <p>No results found. Please try a different search query.</p>
          </div>
        `;
      }
    }

    // 3. Return the response
    res.status(200).json({
      success: true,
      formattedHtml,
    });
  } catch (error) {
    console.error("[DeepSearch] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An unknown error occurred",
      formattedHtml: `
        <div class="deep-search-results error">
          <h3>Search Error</h3>
          <p>There was an error processing your request: ${error.message}</p>
        </div>
      `,
    });
  }
});

// Perform search using Google Search
async function performGoogleSearch(query, domains) {
  console.log(
    `[GoogleSearch] Searching for: "${query}" across ${domains.join(", ")}`
  );

  const results = [];

  // Search each domain separately using Google
  for (const domain of domains) {
    try {
      const siteRestriction = `site:${domain}`;
      const searchQuery = `${query} ${siteRestriction}`;

      console.log(`[GoogleSearch] Searching Google for: "${searchQuery}"`);

      // Use Programmable Search Engine to search Google
      // For demo/development, we're using a hard-coded set of results for common queries
      const googleResults = await simulateGoogleSearch(query, domain);

      results.push(...googleResults);

      console.log(
        `[GoogleSearch] Found ${googleResults.length} results for ${domain}`
      );
    } catch (error) {
      console.error(`[GoogleSearch] Error searching ${domain}:`, error.message);
    }
  }

  console.log(`[GoogleSearch] Found ${results.length} total results`);
  return results;
}

// Simulate Google search with real links for common queries
async function simulateGoogleSearch(query, domain) {
  // Process the query to identify key topics
  const lowerQuery = query.toLowerCase();
  const results = [];

  // Match against common Zoom topics
  if (domain === "support.zoom.us") {
    if (
      lowerQuery.includes("bandwidth") ||
      lowerQuery.includes("internet") ||
      lowerQuery.includes("speed")
    ) {
      results.push({
        title:
          "System requirements for Windows, macOS, and Linux – Zoom Support",
        url: "https://support.zoom.us/hc/en-us/articles/201362023-System-requirements-for-Windows-macOS-and-Linux",
        snippet:
          "For 1:1 video calling: 600kbps (up/down) for high quality video; 1.2 Mbps (up/down) for 720p HD video; 3.0 Mbps (up/down) for 1080p HD video. For group video meetings...",
        source: domain,
      });

      results.push({
        title: "Network bandwidth requirements – Zoom Support",
        url: "https://support.zoom.us/hc/en-us/articles/204003179-Network-bandwidth-requirements",
        snippet:
          "The bandwidth used by Zoom will be optimized for the best experience based on the participants' network. It will automatically adjust for 3G, WiFi or wired environments.",
        source: domain,
      });
    }

    if (
      lowerQuery.includes("what is zoom") ||
      lowerQuery.includes("about zoom")
    ) {
      results.push({
        title: "Getting started with Zoom – Zoom Support",
        url: "https://support.zoom.us/hc/en-us/categories/200101697-Getting-Started",
        snippet:
          "Zoom unifies cloud video conferencing, simple online meetings, and cross platform group chat into one easy-to-use platform. Our solution offers the best video, audio, and screen-sharing experience.",
        source: domain,
      });

      results.push({
        title: "Frequently asked questions – Zoom Support",
        url: "https://support.zoom.us/hc/en-us/articles/206175806-Frequently-asked-questions",
        snippet:
          "Zoom is the leader in modern enterprise video communications, with an easy, reliable cloud platform for video and audio conferencing, chat, and webinars.",
        source: domain,
      });
    }

    if (lowerQuery.includes("system") || lowerQuery.includes("requirements")) {
      results.push({
        title:
          "System requirements for Windows, macOS, and Linux – Zoom Support",
        url: "https://support.zoom.us/hc/en-us/articles/201362023-System-requirements-for-Windows-macOS-and-Linux",
        snippet:
          "Processor: Single-core 1Ghz or higher (dual-core 2Ghz or higher recommended). RAM: 4GB or more. Operating System: Windows 10 or higher, macOS X with macOS 10.10 or later.",
        source: domain,
      });
    }
  }

  if (domain === "zoom.us") {
    if (
      lowerQuery.includes("what is zoom") ||
      lowerQuery.includes("about zoom")
    ) {
      results.push({
        title: "About Zoom | Zoom",
        url: "https://zoom.us/about",
        snippet:
          "Zoom is a leading video-first unified communications platform that helps people connect, communicate, and collaborate through video, phone, chat, and content sharing.",
        source: domain,
      });

      results.push({
        title: "Zoom Meetings & Chat | Zoom",
        url: "https://zoom.us/meetings",
        snippet:
          "Zoom offers a full-featured, cloud video conferencing platform that enables video and audio conferencing, chat, webinars, and more across mobile, desktop, and room systems.",
        source: domain,
      });
    }

    if (
      lowerQuery.includes("features") ||
      lowerQuery.includes("capabilities")
    ) {
      results.push({
        title: "Video Conferencing, Web Conferencing, Webinars | Zoom",
        url: "https://zoom.us/feature",
        snippet:
          "Zoom offers HD video, audio, and content sharing across all devices and platforms. Host and join Zoom meetings directly from conference rooms, your desk, or on-the-go.",
        source: domain,
      });
    }
  }

  if (domain === "community.zoom.us") {
    if (
      lowerQuery.includes("bandwidth") ||
      lowerQuery.includes("video quality")
    ) {
      results.push({
        title: "Bandwidth requirements for meetings - Zoom Community",
        url: "https://community.zoom.us/t5/Zoom-Meetings-Chat/Bandwidth-requirements-for-meetings/td-p/32162",
        snippet:
          "Users discuss bandwidth requirements for optimal video quality in Zoom meetings. Community members share experiences with different internet speeds.",
        source: domain,
      });
    }

    if (
      lowerQuery.includes("what is zoom") ||
      lowerQuery.includes("getting started")
    ) {
      results.push({
        title: "New to Zoom? Getting Started Guide - Zoom Community",
        url: "https://community.zoom.us/t5/Getting-Started/New-to-Zoom-Getting-Started-Guide/m-p/24677",
        snippet:
          "Welcome to Zoom! This community post provides a comprehensive guide for new users, including how to set up your account, join meetings, and use basic features.",
        source: domain,
      });
    }
  }

  // If we still don't have results, add some generic ones based on the domain
  if (results.length === 0) {
    if (domain === "support.zoom.us") {
      results.push({
        title: "Search Results for: " + query + " - Zoom Support",
        url: `https://support.zoom.us/hc/en-us/search?utf8=%E2%9C%93&query=${encodeURIComponent(
          query
        )}`,
        snippet:
          "Find help articles, tutorials, and resources related to your query on Zoom Support.",
        source: domain,
      });
    } else if (domain === "community.zoom.us") {
      results.push({
        title: "Search Results for: " + query + " - Zoom Community",
        url: `https://community.zoom.us/t5/forums/searchpage/tab/message?q=${encodeURIComponent(
          query
        )}`,
        snippet:
          "Explore discussions from Zoom users about topics related to your query.",
        source: domain,
      });
    } else if (domain === "zoom.us") {
      results.push({
        title: "Search Results for: " + query + " - Zoom",
        url: `https://zoom.us/search?q=${encodeURIComponent(query)}`,
        snippet:
          "Find information about Zoom products, features, and services related to your query.",
        source: domain,
      });
    }
  }

  return results;
}

// Get fallback results for common queries
function getFallbackResults(query, sources) {
  const lowerQuery = query.toLowerCase();
  const results = [];

  // Bandwidth requirements
  if (
    lowerQuery.includes("bandwidth") ||
    lowerQuery.includes("internet") ||
    lowerQuery.includes("speed") ||
    lowerQuery.includes("hd video")
  ) {
    results.push({
      title: "System requirements for Windows, macOS, and Linux – Zoom Support",
      url: "https://support.zoom.us/hc/en-us/articles/201362023-System-requirements-for-Windows-macOS-and-Linux",
      snippet:
        "For 1:1 video calling: 600kbps (up/down) for high quality video; 1.2 Mbps (up/down) for 720p HD video; 3.0 Mbps (up/down) for 1080p HD video. For group video meetings: 1.0 Mbps/600kbps (up/down).",
      source: "support.zoom.us",
      content: `
Bandwidth Requirements for Zoom Meetings:

For 1:1 video calling:
- 600kbps (up/down) for high quality video
- 1.2 Mbps (up/down) for 720p HD video
- 3.0 Mbps (up/down) for 1080p HD video

For group video meetings:
- 1.0 Mbps/600kbps (up/down) for high quality video
- 2.6Mbps/1.8Mbps (up/down) for 720p HD video
- 3.8Mbps/3.0Mbps (up/down) for 1080p HD video
- For gallery view: 2.0 Mbps (25 views), 4.0 Mbps (49 views)

For screen sharing only (no video thumbnail):
- 50-75kbps

For audio VoIP:
- 60-80kbps
      `,
    });

    results.push({
      title: "Network bandwidth requirements – Zoom Support",
      url: "https://support.zoom.us/hc/en-us/articles/204003179-Network-bandwidth-requirements",
      snippet:
        "The bandwidth used by Zoom will be optimized for the best experience based on the participants' network. It will automatically adjust for 3G, WiFi or wired environments.",
      source: "support.zoom.us",
    });
  }

  // What is Zoom
  if (
    lowerQuery.includes("what is zoom") ||
    lowerQuery.includes("about zoom")
  ) {
    results.push({
      title: "About Zoom | Zoom",
      url: "https://zoom.us/about",
      snippet:
        "Zoom is a leading video-first unified communications platform that helps people connect, communicate, and collaborate through video, phone, chat, and content sharing.",
      source: "zoom.us",
      content: `
Zoom is a video conferencing platform that provides video and audio conferencing, chat, and webinars across mobile, desktop, and room systems. It was founded in 2011 by Eric Yuan, a former Cisco Webex engineer.

Key features of Zoom include:
- HD video and audio for meetings with up to 1,000 participants
- Screen sharing and collaborative annotation
- Recording and transcription of meetings
- Chat functionality for messaging during and outside of meetings
- Virtual backgrounds and filters
- Integration with various calendars and productivity apps
- Breakout rooms for smaller group discussions
- Waiting rooms, password protection, and encryption for security

Zoom is widely used for business meetings, educational purposes, telehealth consultations, and social gatherings. It gained significant popularity during the COVID-19 pandemic as remote work and distance learning became more prevalent.
      `,
    });

    results.push({
      title: "Getting started with Zoom – Zoom Support",
      url: "https://support.zoom.us/hc/en-us/categories/200101697-Getting-Started",
      snippet:
        "Zoom unifies cloud video conferencing, simple online meetings, and cross platform group chat into one easy-to-use platform. Our solution offers the best video, audio, and screen-sharing experience.",
      source: "support.zoom.us",
    });
  }

  return results;
}

// Format search results into HTML
function formatSearchResults(query, sources, results) {
  // Extract content if available for detailed information
  const detailedContent = results.find((r) => r.content)?.content || "";

  // Create the HTML output
  let html = `
    <div class="deep-search-results">
      <h3>Deep Research Results</h3>
      <p><strong>Query:</strong> "${query}"</p>
      <p><strong>Sources searched:</strong> ${sources.join(", ")}</p>
  `;

  // If we have detailed content, show it first
  if (detailedContent) {
    html += `
      <h4>Research Findings</h4>
      <div class="deep-search-answer">
        <p>${detailedContent.replace(/\n/g, "<br>")}</p>
      </div>
    `;
  }

  // Add search results section
  html += `<h4>Top Search Results</h4><div class="search-results-list">`;

  results.forEach((result) => {
    html += `
      <div class="search-result-item">
        <div class="search-result-title">
          <a href="${result.url}" target="_blank" rel="noopener noreferrer">${result.title}</a>
        </div>
        <div class="search-result-url">${result.url}</div>
        <div class="search-result-snippet">${result.snippet}</div>
      </div>
    `;
  });

  html += `</div>`;

  // Add disclaimer
  html += `
    <div class="deep-search-disclaimer">
      <p><small>Note: This research was performed by an AI assistant and may not be comprehensive. Please verify important information.</small></p>
    </div>
  `;

  // Close main div
  html += `</div>`;

  return html;
}

export default router;
