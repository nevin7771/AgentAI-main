// server/agents/ragSearchAgent.js
// Implementation of a RAG (Retrieval-Augmented Generation) based search agent

import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";
import fetch from "node-fetch";
import { load } from "cheerio";

export default class RagSearchAgent extends BaseAgent {
  constructor(options = {}) {
    // Initialize with RAG-specific agent type
    super({ ...options, agentType: "rag-search" });

    this.name = options.name || "RAG Search Agent";
    this.description =
      options.description ||
      "Searches across sources and generates answers with citations using RAG";

    // Search sources to use
    this.sources = options.sources || [
      "support.zoom.us",
      "community.zoom.us",
      "zoom.us",
    ];

    // Maximum search results to retrieve per source
    this.maxResultsPerSource = options.maxResultsPerSource || 3;

    // Maximum content length to extract from each page
    this.maxContentLength = options.maxContentLength || 10000;

    // OpenAI configuration
    this.openaiApiKey =
      options.apiKey || this.config.apiKey || process.env.OPENAI_API_KEY;
    this.openai = null;

    // Context window management
    this.maxContextLength = options.maxContextLength || 16000;

    // Caching setup (if enabled in config)
    this.cacheEnabled =
      this.config.cacheEnabled !== undefined ? this.config.cacheEnabled : true;
    this.cache = new Map();
    this.cacheTTL = this.config.cacheTTL || 3600 * 1000; // Default 1 hour in ms
  }

  async initialize() {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is required for the RAG Search Agent");
    }

    this.openai = new OpenAI({
      apiKey: this.openaiApiKey,
    });

    this.log("RAG Search Agent initialized with sources:", this.sources);
    return true;
  }

  async execute(query) {
    try {
      if (!this.openai) {
        await this.initialize();
      }

      // Check cache if enabled
      if (this.cacheEnabled) {
        const cacheKey = this.getCacheKey(query);
        const cachedResult = this.getFromCache(cacheKey);
        if (cachedResult) {
          this.log("Returning cached result for query:", query);
          return cachedResult;
        }
      }

      this.log(`Executing RAG search for: "${query}"`);

      // 1. Retrieve relevant search results
      const searchResults = await this.performSearch(query);
      this.log(`Found ${searchResults.length} search results`);

      // 2. Extract and process content from search results
      const processedResults = await this.processSearchResults(searchResults);
      this.log(`Processed ${processedResults.length} results for content`);

      // 3. Generate answer using RAG approach
      const answer = await this.generateRagAnswer(query, processedResults);

      const result = {
        success: true,
        query,
        sources: this.sources,
        results: processedResults,
        answer,
      };

      // Store in cache if enabled
      if (this.cacheEnabled) {
        const cacheKey = this.getCacheKey(query);
        this.storeInCache(cacheKey, result);
      }

      return result;
    } catch (error) {
      this.log("Error during execution:", error);
      return this.handleError(error);
    }
  }

  async performSearch(query) {
    this.log(
      `Searching for "${query}" across sources: ${this.sources.join(", ")}`
    );

    const allResults = [];

    // Search each source domain
    for (const source of this.sources) {
      try {
        this.log(`Searching source: ${source}`);

        // For now, we're using a simulated search function
        // In a production environment, this would be replaced with real API calls
        const sourceResults = await this.simulateSearch(
          query,
          source,
          this.maxResultsPerSource
        );

        allResults.push(...sourceResults);

        this.log(`Found ${sourceResults.length} results from ${source}`);
      } catch (error) {
        this.log(`Error searching ${source}:`, error);
      }
    }

    return allResults;
  }

  async processSearchResults(searchResults) {
    const processedResults = [];

    for (const result of searchResults) {
      try {
        // Extract content from the page
        const content = await this.extractPageContent(result.url);

        processedResults.push({
          ...result,
          extractedContent: content,
        });
      } catch (error) {
        this.log(`Error processing result (${result.url}):`, error);
        // Include the result anyway, just without extracted content
        processedResults.push({
          ...result,
          extractedContent: result.snippet || "",
        });
      }
    }

    return processedResults;
  }

  async extractPageContent(url) {
    this.log(`Extracting content from ${url}`);

    // In a production environment, this would be a real web scraper
    // For now, we'll use a simulated function
    const content = await this.simulateContentExtraction(url);

    // Truncate content if it's too long
    if (content.length > this.maxContentLength) {
      return content.substring(0, this.maxContentLength) + "...";
    }

    return content;
  }

  async generateRagAnswer(query, processedResults) {
    this.log("Generating RAG answer for query:", query);

    // Prepare context from the search results
    const context = this.prepareContext(processedResults);

    // Create prompt for RAG generation
    const prompt = this.createRagPrompt(query, context, processedResults);

    // Generate answer using OpenAI
    const response = await this.openai.chat.completions.create({
      model: this.config.defaultModel || "gpt-4",
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0.5,
    });

    return response.choices[0].message.content;
  }

  prepareContext(processedResults) {
    // Extract and format content from processed results
    let contextText = "";
    let totalLength = 0;

    // Sort results by relevance (assumed to be the order they came in)
    const results = [...processedResults];

    for (const result of results) {
      const resultText = `
SOURCE: ${result.source}
URL: ${result.url}
TITLE: ${result.title}
CONTENT: ${result.extractedContent}
---
`;

      // Check if adding this result would exceed context window
      if (totalLength + resultText.length > this.maxContextLength) {
        this.log("Context window limit reached, truncating...");
        break;
      }

      contextText += resultText;
      totalLength += resultText.length;
    }

    return contextText;
  }

  createRagPrompt(query, context, results) {
    const sourcesList = results
      .map((r) => r.source)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");

    const systemPrompt = `You are a Research Assistant that provides accurate, helpful, and informative answers based on the search results provided. 
Your goal is to synthesize the information from the search results to give the most accurate and helpful response to the user's query.

IMPORTANT GUIDELINES:
1. ONLY use information provided in the SEARCH RESULTS.
2. If the search results don't contain enough information to answer the query comprehensively, acknowledge the limitations.
3. ALWAYS cite your sources by adding a citation number at the end of a statement, like this: [1], [2], etc.
4. Each citation should correspond to a URL in the search results.
5. Do not make up information or URLs.
6. Emphasize the most relevant and accurate information.
7. Provide a structured and clear response.
8. At the end of your answer, include a "Sources" section that lists all cited URLs.`;

    const userPrompt = `QUERY: ${query}

SEARCH RESULTS FROM: ${sourcesList}

${context}

Please provide a comprehensive answer to my query based on these search results. Include citations and a sources section at the end.`;

    return {
      system: systemPrompt,
      user: userPrompt,
    };
  }

  getCacheKey(query) {
    // Simple cache key based on the query and sources
    return `${query}_${this.sources.join("_")}`;
  }

  getFromCache(key) {
    if (!this.cacheEnabled) return null;

    const cachedItem = this.cache.get(key);
    if (!cachedItem) return null;

    // Check if cache entry is expired
    if (Date.now() - cachedItem.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cachedItem.data;
  }

  storeInCache(key, data) {
    if (!this.cacheEnabled) return;

    this.cache.set(key, {
      timestamp: Date.now(),
      data,
    });
  }

  // Simulate search functionality (to be replaced with real search in production)
  async simulateSearch(query, domain, maxResults = 3) {
    this.log(`Simulating search for: "${query}" on ${domain}`);

    // Generate some realistic looking search results based on the query and domain
    const results = [];

    // Common Zoom topics to simulate results for
    const zoomTopics = {
      bandwidth: [
        {
          title: "Network bandwidth requirements – Zoom Support",
          url: `https://support.zoom.us/hc/en-us/articles/204003179-Network-bandwidth-requirements`,
          snippet:
            "The bandwidth used by Zoom will be optimized for the best experience based on the participants' network. It will automatically adjust for 3G, WiFi or wired environments.",
        },
        {
          title: "System requirements – Zoom Support",
          url: `https://support.zoom.us/hc/en-us/articles/201362023-System-requirements-for-Windows-macOS-and-Linux`,
          snippet:
            "For 1:1 video calling: 600kbps (up/down) for high quality video. For group video calling: 1.0 Mbps/600kbps (up/down).",
        },
      ],
      video: [
        {
          title: "Getting started with video – Zoom Support",
          url: `https://support.zoom.us/hc/en-us/articles/201362313-How-Do-I-Start-My-Video-`,
          snippet:
            "You can start your video by clicking on the Start Video button on the toolbar. You can also start your video during a meeting by clicking on Start Video.",
        },
        {
          title: "Video Settings – Zoom Support",
          url: `https://support.zoom.us/hc/en-us/articles/201362623-Changing-settings-in-the-desktop-client-or-mobile-app`,
          snippet:
            "To access video settings, click on the gear icon in the Zoom desktop client, then select the Video tab.",
        },
      ],
      audio: [
        {
          title: "Audio Settings – Zoom Support",
          url: `https://support.zoom.us/hc/en-us/articles/201362283-Testing-computer-or-device-audio`,
          snippet:
            "You can test your audio before joining a meeting or during a meeting. This helps ensure your microphone and speakers are working properly.",
        },
        {
          title: "Audio Echo – Zoom Support",
          url: `https://support.zoom.us/hc/en-us/articles/202050538-Audio-Echo-In-A-Meeting`,
          snippet:
            "Echo can be caused by multiple computers with active audio in the same conference room, or by participants joining a meeting multiple times.",
        },
      ],
    };

    // Find matching topic or use generic results
    let matchedResults = [];

    // Check if the query matches any of our topic keywords
    for (const [topic, topicResults] of Object.entries(zoomTopics)) {
      if (query.toLowerCase().includes(topic)) {
        matchedResults = [...topicResults];
        break;
      }
    }

    // Generate generic results if no topic match or if we need more results
    if (matchedResults.length < maxResults) {
      for (let i = matchedResults.length; i < maxResults; i++) {
        matchedResults.push({
          title: `${query} - Result ${i + 1} from ${domain}`,
          url: `https://${domain}/search?q=${encodeURIComponent(
            query
          )}&result=${i + 1}`,
          snippet: `This is a simulated search result about ${query} from ${domain}. This would contain a snippet of text from the page that matches the search query.`,
        });
      }
    }

    // Slice to ensure we don't exceed max results and add the source domain
    return matchedResults.slice(0, maxResults).map((result) => ({
      ...result,
      source: domain,
    }));
  }

  // Simulate content extraction (to be replaced with real extraction in production)
  async simulateContentExtraction(url) {
    this.log(`Simulating content extraction for: ${url}`);

    // Parse the URL to identify the domain
    let domain = "";
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
    } catch (e) {
      domain = "example.com";
    }

    // Generate content based on URL and domain patterns
    let content = "";

    if (url.includes("bandwidth") || url.includes("network")) {
      content = `
Zoom is optimized to work effectively in environments with different bandwidth capabilities.

Bandwidth requirements for different Zoom activities:

For 1:1 video calling:
• 600kbps (up/down) for high quality video
• 1.2 Mbps (up/down) for 720p HD video
• 3.0 Mbps (up/down) for 1080p HD video

For group video meetings:
• 1.0 Mbps/600kbps (up/down) for high quality video
• 2.6 Mbps/1.8 Mbps (up/down) for 720p HD video
• 3.0 Mbps/2.5 Mbps (up/down) for 1080p HD video

For screen sharing only (no video thumbnail):
• 50-75 kbps

For audio VoIP:
• 60-100 kbps

Zoom automatically adjusts to your available bandwidth. However, for the best experience, we recommend using a wired internet connection when possible.
      `;
    } else if (url.includes("video")) {
      content = `
Getting Started with Zoom Video

Before a meeting:
1. Test your video by clicking "Settings" in the Zoom client
2. Select the "Video" tab
3. Preview your camera

During a meeting:
• Click "Start Video" in the toolbar to turn on your camera
• Click "Stop Video" to turn it off
• Click the arrow next to the video button for more options

Video Settings:
• Touch up my appearance: Applies a soft focus to your camera, smoothing out your skin
• Adjust for low light: Automatically adjusts your video in low-light environments
• Enable HD: Turn on/off HD video (requires more bandwidth)
• Mirror my video: Flip your video horizontally
• Virtual Background: Replace your background with an image or video

Troubleshooting:
• If your video isn't working, check that your camera is properly connected
• Make sure other applications aren't using your camera
• Ensure Zoom has permission to access your camera
• Try restarting your device if issues persist
      `;
    } else if (url.includes("audio")) {
      content = `
Zoom Audio Settings and Troubleshooting

Testing audio before a meeting:
1. Click "Settings" in the Zoom client
2. Select the "Audio" tab
3. Click "Test Speaker" to play a sound
4. Click "Test Mic" to test your microphone

During a meeting:
• Click "Join Audio" to connect your audio
• Use the "Mute/Unmute" button to control your microphone
• Click the arrow next to the microphone for more audio options

Common audio issues and solutions:

1. Echo
   - Cause: Multiple devices in the same room or a participant connected twice
   - Solution: Make sure only one device is producing sound, use headphones

2. Background noise
   - Solution: Use the "Suppress background noise" option (Auto, Low, Medium, High)
   - Solution: Mute when not speaking

3. No sound
   - Check your speaker/headphone connection
   - Make sure the correct audio output is selected
   - Check volume levels
   - Try a different audio device

4. Can't be heard
   - Check if you're muted
   - Make sure the correct microphone is selected
   - Check microphone permissions
   - Try a different microphone

Advanced features:
• Original Sound: Preserves original audio without Zoom's processing (good for music)
• Stereo Sound: Enables stereo audio transmission
• Automatic gain control: Automatically adjusts microphone volume
      `;
    } else if (domain.includes("community")) {
      content = `
Community Discussion Thread

User1234 (Original Poster):
I've been having an issue with ${
        url.includes("video")
          ? "my video quality"
          : url.includes("audio")
          ? "echo during meetings"
          : "Zoom in general"
      }. Has anyone else experienced this? I'm using the latest version on Windows 10.

ZoomExpert (Community Moderator):
Thanks for posting your question. This is a common issue that many users encounter. Have you tried ${
        url.includes("video")
          ? "checking your bandwidth and video settings"
          : url.includes("audio")
          ? "using headphones and testing your audio"
          : "restarting the Zoom client"
      }?

User5678:
I had the same problem last week. What worked for me was ${
        url.includes("video")
          ? "lowering the video quality in settings"
          : url.includes("audio")
          ? "using external headphones instead of built-in speakers"
          : "updating to the latest version"
      }. Hope this helps!

TechSavvy:
Also make sure to check your ${
        url.includes("video")
          ? "camera drivers"
          : url.includes("audio")
          ? "audio drivers"
          : "system requirements"
      }. I found that updating those solved many of my issues.

ZoomSupport (Verified Employee):
Hi everyone, just to add to this discussion, we recommend:
1. Make sure you're on the latest version
2. Check your settings in the Zoom client
3. Try the web client to see if the issue persists
4. If all else fails, please submit a support ticket at support.zoom.us
      `;
    } else {
      // Generic content for other URLs
      content = `
This is simulated content for ${url} on domain ${domain}.

The page would typically contain information related to Zoom's features, troubleshooting steps, or community discussions about Zoom functionality.

In a real implementation, this would be actual content extracted from the webpage by scraping or using a site's API.

Key points that might be included:
- Detailed explanation of Zoom features
- Step-by-step instructions for using Zoom
- Troubleshooting common issues
- System requirements and compatibility information
- Best practices for Zoom meetings
      `;
    }

    return content;
  }

  formatResponse(data) {
    if (!data.success) {
      return `<div class="rag-search-results error">
        <h3>Search Error</h3>
        <p>Sorry, there was an error processing your search request: ${data.error}</p>
      </div>`;
    }

    // Process the answer to extract and enhance citations
    let answer = data.answer;

    // Extract URLs from the results for citation section
    const urls = data.results.map((r) => r.url);
    const uniqueUrls = [...new Set(urls)];

    // Format the main response with clean HTML
    let html = `
      <div class="rag-search-results">
        <h3>Search Results</h3>
        <p><strong>Query:</strong> "${data.query}"</p>
        <p><strong>Sources searched:</strong> ${data.sources.join(", ")}</p>
        
        <div class="rag-search-answer">${answer}</div>
    `;

    // Add top search results section
    html += `
      <h4>Top Search Results</h4>
      <div class="search-results-list">
    `;

    data.results.slice(0, 5).forEach((result, index) => {
      html += `
        <div class="search-result-item">
          <h5>
            <a href="${result.url}" target="_blank" rel="noopener noreferrer">
              ${result.title}
            </a>
          </h5>
          <p class="search-result-source">${result.source}</p>
          <p class="search-result-snippet">${result.snippet}</p>
        </div>
      `;
    });

    html += `</div>`;

    // Add disclaimer
    html += `
      <div class="rag-search-disclaimer">
        <p><small>Note: This search was performed by an AI assistant and may not be comprehensive. Please verify important information.</small></p>
      </div>
    `;

    // Close the main div
    html += `</div>`;

    return html;
  }
}
