// server/agents/deepSearchAgent.js
// Enhanced implementation using RAG and Deep Research patterns

import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";
import axios from "axios";
import * as cheerio from "cheerio";

export default class DeepSearchAgent extends BaseAgent {
  constructor(options = {}) {
    super(options);
    this.name = "Deep Search Agent";
    this.description = "Advanced web search and research agent using RAG";
    this.sources = options.sources || [
      "support.zoom.us",
      "community.zoom.us",
      "zoom.us",
    ];
    this.maxIterations = options.maxIterations || 5;
    this.openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    this.searchTimeout = options.searchTimeout || 30000;
    this.openai = null;

    // Research parameters
    this.depth = options.depth || 2;
    this.breadth = options.breadth || 3;
    this.visitedUrls = new Set();
  }

  async initialize() {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is required for the Deep Search Agent");
    }

    this.openai = new OpenAI({
      apiKey: this.openaiApiKey,
    });

    return true;
  }

  async execute(query) {
    try {
      if (!this.openai) {
        await this.initialize();
      }

      console.log(`[${this.name}] Starting deep research for: "${query}"`);
      console.log(`[${this.name}] Sources: ${this.sources.join(", ")}`);

      const startTime = Date.now();

      // Step 1: Generate enhanced search queries to better understand user's intent
      const enhancedQueries = await this.generateEnhancedQueries(query);
      console.log(
        `[${this.name}] Enhanced queries generated:`,
        enhancedQueries
      );

      // Step 2: Research with depth and breadth
      const researchResults = await this.research({
        query,
        enhancedQueries,
        depth: this.depth,
        breadth: this.breadth,
      });

      // Step 3: Generate final report
      const report = await this.generateReport(query, researchResults);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      return {
        success: true,
        query,
        sources: this.sources,
        executionTimeMs: executionTime,
        enhancedQueries,
        visitedUrls: Array.from(this.visitedUrls),
        report,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Generate improved search queries based on the original query
   */
  async generateEnhancedQueries(query) {
    const systemPrompt = `You are an expert researcher. Follow these instructions when responding:
- Your task is to analyze the original query and generate ${this.breadth} different search queries that would help gather comprehensive information on the topic.
- Make each query specific and targeted to cover different aspects of the original question.
- Return only the queries, no explanations needed.`;

    const userPrompt = `Original query: "${query}"
Generate ${this.breadth} different search queries to research this topic thoroughly.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      // Parse the numbered list into an array
      const queries = content
        .split(/\d+\.\s+/)
        .filter((q) => q.trim().length > 0)
        .map((q) => q.trim());

      return queries.length > 0 ? queries : [query];
    } catch (error) {
      console.error("[Error generating enhanced queries]", error);
      return [query]; // Fall back to original query
    }
  }

  /**
   * Main research function that implements depth and breadth search
   */
  async research({ query, enhancedQueries, depth, breadth }) {
    const learnings = [];
    let currentDepth = 0;

    // Start with enhanced queries as the initial queries
    let currentQueries = enhancedQueries.slice(0, breadth);

    while (currentDepth < depth && currentQueries.length > 0) {
      console.log(`[${this.name}] Research depth ${currentDepth + 1}/${depth}`);

      const newLearnings = [];
      const newQueries = [];

      // Process each query at current depth level
      for (const currentQuery of currentQueries) {
        try {
          // Search for results
          const searchResults = await this.performSearch(currentQuery);

          // Extract content from top results
          const extractedContents = await this.extractContentFromResults(
            searchResults
          );

          // Process and summarize findings
          const { findings, followUpQueries } = await this.processSerpResults(
            currentQuery,
            extractedContents
          );

          newLearnings.push(...findings);
          newQueries.push(...followUpQueries);
        } catch (error) {
          console.error(`[Error researching query "${currentQuery}"]`, error);
        }
      }

      // Add new learnings to overall learnings
      learnings.push(...newLearnings);

      // Move to next depth with new queries
      currentDepth++;
      currentQueries = newQueries.slice(0, breadth);
    }

    return {
      learnings,
      visitedUrls: Array.from(this.visitedUrls),
    };
  }

  /**
   * Perform search using domain-specific search
   */
  async performSearch(query) {
    console.log(`[${this.name}] Searching for: "${query}"`);
    const results = [];

    // Search each domain
    for (const domain of this.sources) {
      try {
        // Simulate search results for each domain with the query
        const domainResults = await this.simulateSearchForDomain(query, domain);
        results.push(...domainResults);
      } catch (error) {
        console.error(`[Error searching ${domain}]`, error);
      }
    }

    // Sort by relevance and take top results
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
  }

  /**
   * Simulate search for a specific domain
   * In a production environment, this would use actual search APIs
   */
  async simulateSearchForDomain(query, domain) {
    // This would be replaced with actual search calls in production
    const lowerQuery = query.toLowerCase();
    const results = [];

    // Support domain
    if (domain === "support.zoom.us") {
      if (lowerQuery.includes("bandwidth") || lowerQuery.includes("internet")) {
        results.push({
          title:
            "System requirements for Windows, macOS, and Linux – Zoom Support",
          url: "https://support.zoom.us/hc/en-us/articles/201362023-System-requirements-for-Windows-macOS-and-Linux",
          snippet:
            "For 1:1 video calling: 600kbps (up/down) for high quality video. 1.2 Mbps (up/down) for 720p HD video.",
          relevance: 0.95,
        });
      }

      if (lowerQuery.includes("settings") || lowerQuery.includes("audio")) {
        results.push({
          title: "Audio settings and troubleshooting – Zoom Support",
          url: "https://support.zoom.us/hc/en-us/articles/201362283-Audio-settings-and-troubleshooting",
          snippet:
            "Learn about audio settings, joining audio by phone, and troubleshooting audio issues in Zoom meetings.",
          relevance: 0.9,
        });
      }
    }

    // Community domain
    if (domain === "community.zoom.us") {
      if (lowerQuery.includes("problem") || lowerQuery.includes("issue")) {
        results.push({
          title: "Common Zoom Meeting Issues and Solutions - Zoom Community",
          url: "https://community.zoom.us/t5/Meetings/Common-Zoom-Meeting-Issues-and-Solutions/td-p/12226",
          snippet:
            "Community discussion of common Zoom meeting issues and solutions shared by users.",
          relevance: 0.85,
        });
      }
    }

    // Main domain
    if (domain === "zoom.us") {
      if (lowerQuery.includes("features")) {
        results.push({
          title: "Zoom Meetings Features | Zoom",
          url: "https://zoom.us/meetings",
          snippet:
            "Zoom Meetings feature HD video and audio, collaboration tools, chat functionality, and recording capabilities.",
          relevance: 0.8,
        });
      }

      if (lowerQuery.includes("pricing") || lowerQuery.includes("plans")) {
        results.push({
          title: "Zoom Plans & Pricing | Zoom",
          url: "https://zoom.us/pricing",
          snippet:
            "Compare Zoom meeting plans and pricing to find the best solution for your business or organization.",
          relevance: 0.75,
        });
      }
    }

    // If no specific results, add generic ones
    if (results.length === 0) {
      results.push({
        title: `${domain} Search: ${query}`,
        url: `https://${domain}/search?q=${encodeURIComponent(query)}`,
        snippet: `Results from ${domain} for query "${query}"`,
        relevance: 0.5,
      });
    }

    return results;
  }

  /**
   * Extract content from search results
   * In production, this would actually fetch and process the pages
   */
  async extractContentFromResults(results) {
    const contents = [];

    for (const result of results) {
      try {
        // Track visited URLs
        if (this.visitedUrls.has(result.url)) {
          console.log(
            `[${this.name}] Skipping already visited URL: ${result.url}`
          );
          continue;
        }

        this.visitedUrls.add(result.url);

        // In a real implementation, fetch and extract the actual content
        // For now, we'll use the snippet as the content
        const content = await this.simulateContentExtraction(result);
        contents.push({
          url: result.url,
          title: result.title,
          content: content,
        });
      } catch (error) {
        console.error(`[Error extracting content from ${result.url}]`, error);
      }
    }

    return contents;
  }

  /**
   * Simulate content extraction from a webpage
   * In production, this would fetch and parse the actual page
   */
  async simulateContentExtraction(result) {
    // This simulates fetching and extracting content from a webpage
    // In a real implementation, you would use axios/fetch and cheerio to parse HTML

    // For demonstration, we'll just use the URL to determine the content
    const url = result.url.toLowerCase();

    if (url.includes("system-requirements")) {
      return `
        System Requirements for Zoom:
        
        Bandwidth requirements:
        - For 1:1 video calling: 600kbps (up/down) for high quality video
        - 1.2 Mbps (up/down) for 720p HD video
        - 3.0 Mbps (up/down) for 1080p HD video
        
        Hardware requirements:
        - Processor: Single-core 1Ghz or higher (dual-core 2Ghz or higher recommended)
        - RAM: 4GB or more
        - Operating System: Windows 10 or higher, macOS X with macOS 10.10 or later
        
        Mobile devices:
        - iOS 8.0 or later
        - Android 5.0 or later
      `;
    }

    if (url.includes("audio-settings")) {
      return `
        Audio Settings and Troubleshooting in Zoom:
        
        Audio settings:
        - Test your microphone and speakers before joining a meeting
        - Use the "Mute" and "Unmute" buttons to control your microphone
        - Click the upward arrow (^) next to the mute button to change your microphone or speaker
        
        Joining audio by phone:
        - Dial-in using the provided phone numbers
        - Enter the meeting ID followed by # when prompted
        - Enter the participant ID if you have one
        
        Troubleshooting:
        - Ensure your microphone and speakers are properly connected
        - Check your computer's audio settings
        - Try using headphones to reduce echo
        - Close other applications that might be using your microphone
      `;
    }

    // For other URLs, return a generic content based on the snippet
    return (
      result.snippet +
      "\n\nThis page contains information relevant to your search query."
    );
  }

  /**
   * Process SERP results to extract findings and generate follow-up queries
   */
  async processSerpResults(query, contents) {
    if (contents.length === 0) {
      return { findings: [], followUpQueries: [] };
    }

    const combinedContent = contents
      .map(
        (item, index) =>
          `Content ${index + 1} from ${item.url}:\n${item.content}`
      )
      .join("\n\n");

    const systemPrompt = `You are an expert researcher and information synthesizer. Your task is to analyze the content provided and:
1. Extract the most important findings and insights related to the original query.
2. Generate follow-up questions that would be worth exploring to deepen the research.`;

    const userPrompt = `Original query: "${query}"
    
Contents to analyze:
${combinedContent}

Please provide:
1. A list of 3-5 key findings or insights from the content (be specific and detailed)
2. A list of 2-3 follow-up questions that would deepen the research`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
      });

      const content = response.choices[0].message.content;

      // Parse findings and follow-up questions
      const findingsMatch = content.match(
        /key findings([\s\S]*?)(?=follow-up|$)/i
      );
      const questionsMatch = content.match(/follow-up questions([\s\S]*?)$/i);

      const findings = findingsMatch
        ? findingsMatch[1]
            .split(/\d+\./)
            .filter((f) => f.trim().length > 0)
            .map((f) => f.trim())
        : [];

      const followUpQueries = questionsMatch
        ? questionsMatch[1]
            .split(/\d+\./)
            .filter((q) => q.trim().length > 0)
            .map((q) => q.trim())
        : [];

      return { findings, followUpQueries };
    } catch (error) {
      console.error("[Error processing SERP results]", error);
      return { findings: [], followUpQueries: [] };
    }
  }

  /**
   * Generate final comprehensive report based on all findings
   */
  async generateReport(originalQuery, researchResults) {
    const { learnings, visitedUrls } = researchResults;

    if (learnings.length === 0) {
      return "No significant findings were discovered. Please try a different search query or consider broadening your search terms.";
    }

    const systemPrompt = `You are a professional research analyst tasked with creating comprehensive, well-organized reports.
Always use markdown formatting to create a structured, readable report that includes:
- A clear introduction summarizing the research query and approach
- Well-organized sections with appropriate headings
- Bullet points for key findings and information
- Citations to sources where appropriate
- A conclusion that synthesizes the findings`;

    const userPrompt = `
Create a comprehensive research report on the following query:
"${originalQuery}"

Based on these research findings:
${learnings
  .map((learning, index) => `Finding ${index + 1}: ${learning}`)
  .join("\n\n")}

Sources consulted:
${Array.from(this.visitedUrls)
  .map((url) => `- ${url}`)
  .join("\n")}

Your report should be thorough, well-structured, and include all relevant information discovered during research.
Use markdown formatting to create a professional, readable document.
`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("[Error generating report]", error);
      return (
        "An error occurred while generating the research report. Here are the raw findings:\n\n" +
        learnings
          .map((learning, index) => `Finding ${index + 1}: ${learning}`)
          .join("\n\n")
      );
    }
  }

  formatResponse(data) {
    if (!data.success) {
      return `<div class="deep-search-results error">
        <h3>Deep Research Error</h3>
        <p>Sorry, there was an error processing your deep search request: ${data.error}</p>
      </div>`;
    }

    // Format the enhanced queries section
    const enhancedQueriesHtml =
      data.enhancedQueries?.length > 0
        ? `<div class="research-queries">
          <h4>Research Directions Explored</h4>
          <ul>
            ${data.enhancedQueries.map((query) => `<li>${query}</li>`).join("")}
          </ul>
        </div>`
        : "";

    // Format the sources section
    const sourcesHtml =
      data.visitedUrls?.length > 0
        ? `<div class="research-sources">
          <h4>Sources Consulted</h4>
          <ul>
            ${data.visitedUrls
              .map(
                (url) =>
                  `<li><a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a></li>`
              )
              .join("")}
          </ul>
        </div>`
        : "";

    // Format the main report section using the report content
    // The report is already formatted with markdown, so we just need to insert it
    const reportHtml = `<div class="research-report">${data.report}</div>`;

    // Combine all sections into the final HTML
    return `
      <div class="deep-search-results">
        <h3>Deep Research Results</h3>
        <p><strong>Query:</strong> "${data.query}"</p>
        
        ${enhancedQueriesHtml}
        
        ${reportHtml}
        
        ${sourcesHtml}
        
        <div class="deep-search-disclaimer">
          <p><small>Note: This research was performed by an AI assistant and may not be comprehensive. Please verify important information.</small></p>
        </div>
      </div>
    `;
  }
}
