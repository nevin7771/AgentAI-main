// server/agents/deepResearchAgent.js
// Implementation based on search_with_ai-main/apps/server/src/service/research/index.ts

import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";
import axios from "axios";
import * as cheerio from "cheerio";

// Search engine types
const SearchEngineType = {
  SIMULATED: "simulated", // For development without API keys
  GOOGLE: "google",
  BING: "bing",
  SEARXNG: "searxng"
};

export default class DeepResearchAgent extends BaseAgent {
  constructor(options = {}) {
    super(options);
    this.name = "Deep Research Agent";
    this.description = "Advanced recursive research agent using RAG patterns";
    
    // Configuration options
    this.sources = options.sources || [
      "support.zoom.us",
      "community.zoom.us",
      "zoom.us",
    ];
    this.openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    this.openai = null;
    this.searchEngine = options.searchEngine || SearchEngineType.SIMULATED;
    this.searchTimeout = options.searchTimeout || 30000;
    
    // Research parameters
    this.depth = options.depth || 2;
    this.breadth = options.breadth || 3;
    this.visitedUrls = new Set();
    this.learnings = [];
    this.progress = null;
    this.onProgress = options.onProgress || null;
  }

  async initialize() {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is required for the Deep Research Agent");
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

      const startTime = Date.now();

      // Set initial progress
      this.progress = {
        currentDepth: this.depth,
        currentQuery: query,
        visitedUrls: [],
        status: "analyzing"
      };
      this.updateProgress();

      // Step 1: Generate initial combined query with follow-up questions
      const combinedQuery = await this.generateCombinedQuery(query);
      console.log(`[${this.name}] Generated combined query`);

      // Step 2: Research with depth and breadth
      const researchResults = await this.research({
        query: combinedQuery,
        depth: this.depth,
        breadth: this.breadth,
      });

      // Update progress to summarizing
      this.progress.status = "summarizing";
      this.updateProgress();

      // Step 3: Generate final report
      const report = await this.generateReport(query, researchResults.learnings);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Final progress update
      this.progress.status = "done";
      this.updateProgress();

      return {
        success: true,
        query,
        executionTimeMs: executionTime,
        visitedUrls: Array.from(this.visitedUrls),
        learnings: researchResults.learnings,
        report,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  updateProgress() {
    if (this.onProgress && this.progress) {
      this.onProgress(this.progress);
    }
  }

  /**
   * Generate combined query with follow-up questions and answers
   */
  async generateCombinedQuery(initialQuery, numFollowUpQuestions = 3) {
    // Step 1: Generate initial search questions
    const queries = await this.generateInitialQueries(initialQuery, numFollowUpQuestions);
    
    // Update progress
    this.progress.status = "searching";
    this.updateProgress();
    
    // Step 2: Generate follow-up questions and answers
    const followUpQuestions = await this.generateFollowUpQuestions(queries);
    
    // Step 3: Combine into a rich query
    const combinedQuery = `
      Initial Query: ${initialQuery}
      Follow-up Questions and Answers:
      ${followUpQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n')}
    `;
    
    return combinedQuery;
  }

  /**
   * Generate initial queries based on the original query
   */
  async generateInitialQueries(query, numQuestions = 3) {
    const systemPrompt = this.deepResearchSystemPrompt();
    const prompt = this.generateInitialQueryPrompt(query, numQuestions);

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      
      // Try to parse as JSON first
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          const parsed = JSON.parse(jsonMatch[1]);
          return parsed.queries.slice(0, numQuestions);
        }
      } catch (e) {
        console.error("Error parsing JSON", e);
      }
      
      // Fall back to parsing numbered list
      const queries = content
        .split(/\d+\.\s+/)
        .filter((q) => q.trim().length > 0)
        .map((q) => q.trim());

      return queries.length > 0 ? queries.slice(0, numQuestions) : [query];
    } catch (error) {
      console.error("[Error generating initial queries]", error);
      return [query]; // Fall back to original query
    }
  }

  /**
   * Generate follow-up questions and answers based on initial queries
   */
  async generateFollowUpQuestions(queries) {
    // For each query, search and get contexts
    const results = await Promise.all(
      queries.map(async (query) => {
        const results = await this.search(query);
        return results;
      })
    );
    
    const contexts = results.flatMap(item => item.map(item => item.snippet));
    const prompt = this.generateFollowUpPrompt(queries, contexts);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: this.deepResearchSystemPrompt() },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      
      // Try to parse as JSON first
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          const parsed = JSON.parse(jsonMatch[1]);
          return parsed.questions;
        }
      } catch (e) {
        console.error("Error parsing JSON", e);
      }
      
      // Fall back to parsing manually
      const questionBlocks = content.split(/Q\d+:|Question \d+:/).slice(1);
      const questions = questionBlocks.map(block => {
        const parts = block.split(/A:|Answer:/);
        if (parts.length >= 2) {
          return {
            question: parts[0].trim(),
            answer: parts[1].trim()
          };
        }
        return null;
      }).filter(q => q !== null);

      return questions.length > 0 ? questions : [];
    } catch (error) {
      console.error("[Error generating follow-up questions]", error);
      return [];
    }
  }

  /**
   * Main research function that implements depth and breadth search
   */
  async research({
    query,
    depth,
    breadth,
    learnings = [],
    visitedUrls = [],
  }) {
    const progress = {
      currentDepth: depth,
      currentQuery: query,
      visitedUrls,
      status: "researching"
    };

    this.progress = progress;
    this.updateProgress();

    // Step 1: Generate search queries based on current knowledge
    const serpQueries = await this.generateSerpQueries(query, breadth, learnings);
    console.log(`[${this.name}] Generated ${serpQueries.length} SERP queries`);

    // Step 2: Research each query in parallel
    const results = await Promise.all(
      serpQueries.map(async (query) => {
        try {
          // Update progress with current search details
          this.progress = {
            ...progress,
            searchProgress: {
              status: "searching",
              target: query
            }
          };
          this.updateProgress();

          // Search for results
          const results = await this.search(query.query);
          const urls = results.map(item => item.url);

          // Update progress for reading
          this.progress = {
            ...progress,
            searchProgress: {
              status: "reading",
              target: query,
              total: urls.length
            }
          };
          this.updateProgress();

          // Process search results
          const { learnings: newLearnings, followUpQuestions } = await this.processSerpResult({
            query: query.query,
            results,
            numFollowUpQuestions: Math.ceil(breadth / 2)
          });

          // Track all learnings and visited URLs
          const allLearnings = [...learnings, ...newLearnings];
          const allUrls = [...visitedUrls, ...urls];
          this.visitedUrls = new Set([...this.visitedUrls, ...urls]);

          // If there's depth remaining, recursively research follow-up questions
          const newDepth = depth - 1;
          if (newDepth > 0 && followUpQuestions.length > 0) {
            const newQuery = `Previous research goal: ${query.researchGoal}\nFollow-up research directions: ${followUpQuestions.map(q => `\n${q}`).join('')}`.trim();
            return this.research({
              query: newQuery,
              depth: newDepth,
              breadth: Math.ceil(breadth / 2),
              learnings: allLearnings,
              visitedUrls: allUrls,
            });
          } else {
            return { learnings: allLearnings, urls: allUrls };
          }
        } catch (error) {
          console.error(`[Error researching query "${query.query}"]`, error);
          return { learnings: [], urls: [] };
        }
      })
    );

    // Combine all results
    return {
      learnings: results.flatMap((item) => item.learnings),
      urls: results.flatMap((item) => item.urls)
    };
  }

  /**
   * Generate search engine queries based on current query and learnings
   */
  async generateSerpQueries(query, numQueries = 3, learnings = []) {
    try {
      const prompt = this.generateSerpQueriesPrompt(query, numQueries, learnings);
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: this.deepResearchSystemPrompt() },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const content = response.choices[0].message.content;
      
      // Try to parse as JSON first
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          const parsed = JSON.parse(jsonMatch[1]);
          return parsed.queries.slice(0, numQueries);
        }
      } catch (e) {
        console.error("Error parsing JSON", e);
      }
      
      // Fall back to parsing manually
      const queryBlocks = content.split(/Query \d+:|\d+\. /).slice(1);
      const queries = queryBlocks.map(block => {
        const lines = block.split("\n").filter(line => line.trim().length > 0);
        if (lines.length > 0) {
          // Try to extract research goal if it exists
          const goalMatch = block.match(/Goal|Purpose|Objective|Aim:(.*?)(?=(Query|$))/is);
          const researchGoal = goalMatch ? goalMatch[1].trim() : "Understand the topic";
          
          return {
            query: lines[0].trim(),
            researchGoal
          };
        }
        return null;
      }).filter(q => q !== null);

      return queries.length > 0 ? queries.slice(0, numQueries) : [
        { query, researchGoal: "Understand the main topic" }
      ];
    } catch (error) {
      console.error("[Error generating SERP queries]", error);
      return [
        { query, researchGoal: "Understand the main topic" }
      ];
    }
  }

  /**
   * Perform search using selected search engine
   */
  async search(query) {
    console.log(`[${this.name}] Searching for: "${query}"`);
    
    // Use the appropriate search engine based on configuration
    switch (this.searchEngine) {
      case SearchEngineType.GOOGLE:
        // Implement Google search integration here
        return this.simulateSearch(query);
        
      case SearchEngineType.BING:
        // Implement Bing search integration here
        return this.simulateSearch(query);
        
      case SearchEngineType.SEARXNG:
        // Implement SearXNG integration here
        return this.simulateSearch(query);
        
      case SearchEngineType.SIMULATED:
      default:
        return this.simulateSearch(query);
    }
  }

  /**
   * Simulate search results for development without API keys
   */
  async simulateSearch(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();
    
    // Generate simulated results based on query and sources
    for (const domain of this.sources) {
      // Support domain
      if (domain === "support.zoom.us") {
        if (lowerQuery.includes("bandwidth") || lowerQuery.includes("internet")) {
          results.push({
            title: "System requirements for Windows, macOS, and Linux – Zoom Support",
            url: "https://support.zoom.us/hc/en-us/articles/201362023-System-requirements-for-Windows-macOS-and-Linux",
            snippet: "For 1:1 video calling: 600kbps (up/down) for high quality video. 1.2 Mbps (up/down) for 720p HD video.",
            source: domain,
          });
        }

        if (lowerQuery.includes("settings") || lowerQuery.includes("audio")) {
          results.push({
            title: "Audio settings and troubleshooting – Zoom Support",
            url: "https://support.zoom.us/hc/en-us/articles/201362283-Audio-settings-and-troubleshooting",
            snippet: "Learn about audio settings, joining audio by phone, and troubleshooting audio issues in Zoom meetings.",
            source: domain,
          });
        }
      }

      // Community domain
      if (domain === "community.zoom.us") {
        if (lowerQuery.includes("problem") || lowerQuery.includes("issue")) {
          results.push({
            title: "Common Zoom Meeting Issues and Solutions - Zoom Community",
            url: "https://community.zoom.us/t5/Meetings/Common-Zoom-Meeting-Issues-and-Solutions/td-p/12226",
            snippet: "Community discussion of common Zoom meeting issues and solutions shared by users.",
            source: domain,
          });
        }
      }

      // Main domain
      if (domain === "zoom.us") {
        if (lowerQuery.includes("features")) {
          results.push({
            title: "Zoom Meetings Features | Zoom",
            url: "https://zoom.us/meetings",
            snippet: "Zoom Meetings feature HD video and audio, collaboration tools, chat functionality, and recording capabilities.",
            source: domain,
          });
        }

        if (lowerQuery.includes("pricing") || lowerQuery.includes("plans")) {
          results.push({
            title: "Zoom Plans & Pricing | Zoom",
            url: "https://zoom.us/pricing",
            snippet: "Compare Zoom meeting plans and pricing to find the best solution for your business or organization.",
            source: domain,
          });
        }
      }

      // Add a generic result if no specific matches
      if (results.length < 3) {
        results.push({
          title: `${domain} Search: ${query}`,
          url: `https://${domain}/search?q=${encodeURIComponent(query)}`,
          snippet: `Results from ${domain} for query "${query}".`,
          source: domain,
        });
      }
    }

    // Sort by relevance (in a real implementation, this would be done by the search engine)
    return results.slice(0, 5);
  }

  /**
   * Extract content from search results
   * In production, this would fetch actual web content
   */
  async extractContentFromResults(results) {
    const contents = [];

    for (const result of results) {
      try {
        // Skip already visited URLs
        if (this.visitedUrls.has(result.url)) {
          console.log(`[${this.name}] Skipping already visited URL: ${result.url}`);
          continue;
        }

        // Add to visited URLs
        this.visitedUrls.add(result.url);

        // In a real implementation, fetch and extract the actual content
        // Here we simulate content based on the URL
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
   */
  async simulateContentExtraction(result) {
    const url = result.url.toLowerCase();

    // Simulate different content based on URL patterns
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

    // Generic content based on the snippet
    return `${result.snippet}\n\nThis page contains information about ${result.title}. The content relates to ${result.source} and provides details about the query.`;
  }

  /**
   * Process search results to extract learnings and generate follow-up questions
   */
  async processSerpResult({
    query,
    results,
    numLearnings = 3,
    numFollowUpQuestions = 3
  }) {
    // Extract content from results
    const contents = await this.extractContentFromResults(results);
    
    if (contents.length === 0) {
      return { learnings: [], followUpQuestions: [] };
    }

    // Combine all content for processing
    const combinedContent = contents
      .map((item, index) => `Content ${index + 1} from ${item.url}:\n${item.content}`)
      .join("\n\n");

    const prompt = this.processSerpResultPrompt(query, combinedContent, numLearnings, numFollowUpQuestions);

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: this.deepResearchSystemPrompt() },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
      });

      const content = response.choices[0].message.content;
      
      // Try to parse as JSON first
      try {
        const jsonMatch = content.match(/```json\n([\s\S]*)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          const parsed = JSON.parse(jsonMatch[1]);
          return {
            learnings: parsed.learnings,
            followUpQuestions: parsed.followUpQuestions
          };
        }
      } catch (e) {
        console.error("Error parsing JSON", e);
      }
      
      // Fallback parsing
      const learningsMatch = content.match(/Learnings|Findings|Key Points:[\s\S]*?(?=Follow-up Questions|$)/i);
      const questionsMatch = content.match(/Follow-up Questions|Further Research|Questions to Explore:[\s\S]*?$/i);

      const learnings = learningsMatch
        ? learningsMatch[0]
            .split(/\d+\.\s+|\*\s+/)
            .filter((f) => f.trim().length > 0 && !f.trim().toLowerCase().includes("learning"))
            .map((f) => f.trim())
        : [];

      const followUpQuestions = questionsMatch
        ? questionsMatch[0]
            .split(/\d+\.\s+|\*\s+/)
            .filter((q) => q.trim().length > 0 && !q.trim().toLowerCase().includes("follow-up"))
            .map((q) => q.trim())
        : [];

      return { learnings, followUpQuestions };
    } catch (error) {
      console.error("[Error processing SERP results]", error);
      return { learnings: [], followUpQuestions: [] };
    }
  }

  /**
   * Generate final comprehensive report based on all findings
   */
  async generateReport(originalQuery, learnings) {
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
    ${learnings.map((learning, index) => `Finding ${index + 1}: ${learning}`).join("\n\n")}
    
    Sources consulted:
    ${Array.from(this.visitedUrls).map((url) => `- ${url}`).join("\n")}
    
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
        learnings.map((learning, index) => `Finding ${index + 1}: ${learning}`).join("\n\n")
      );
    }
  }

  formatResponse(data) {
    if (!data.success) {
      return `<div class="deep-research-results error">
        <h3>Deep Research Error</h3>
        <p>Sorry, there was an error processing your research request: ${data.error}</p>
      </div>`;
    }

    // Format the learnings section if available
    const learningsHtml = data.learnings?.length > 0
      ? `<div class="research-learnings">
          <h4>Key Research Findings</h4>
          <ul>
            ${data.learnings.map((learning) => `<li>${learning}</li>`).join("")}
          </ul>
        </div>`
      : "";

    // Format the sources section
    const sourcesHtml = data.visitedUrls?.length > 0
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

    // Process the report content (convert markdown to HTML)
    const processedReport = this.markdownToHtml(data.report);

    // Format the main report section
    const reportHtml = `<div class="research-report">${processedReport}</div>`;

    // Combine all sections into the final HTML
    return `
      <div class="deep-research-results">
        <h3>Deep Research Results</h3>
        <p><strong>Query:</strong> "${data.query}"</p>
        
        ${reportHtml}
        
        ${sourcesHtml}
        
        <div class="deep-research-disclaimer">
          <p><small>Note: This research was performed by an AI assistant and may not be comprehensive. Please verify important information.</small></p>
        </div>
      </div>
    `;
  }

  /**
   * Simple markdown to HTML converter
   */
  markdownToHtml(markdown) {
    if (!markdown) return "";
    
    return markdown
      // Headers
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
      
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      
      // Links
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>')
      
      // Lists
      .replace(/^\* (.*)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.*)$/gm, '<li>$1</li>')
      
      // Blockquotes
      .replace(/^> (.*)$/gm, '<blockquote>$1</blockquote>')
      
      // Paragraphs
      .replace(/^(?!<[a-z]+>)(.+)$/gm, '<p>$1</p>');
  }

  /**
   * Highlight important keywords in the text
   */
  highlightKeywords(text) {
    // List of important keywords to highlight
    const keywords = [
      'audio', 'microphone', 'speakers', 'headphones', 'settings', 'test',
      'troubleshoot', 'issues', 'echo', 'volume', 'connection', 'update',
      'phone', 'dial', 'meeting', 'quality', 'video', 'bandwidth'
    ];
    
    let highlightedText = text;
    
    // Highlight each keyword
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
      highlightedText = highlightedText.replace(regex, '<strong>$1</strong>');
    });
    
    return highlightedText;
  }
  
  /**
   * Generate follow-up questions based on learnings
   */
  generateFollowUpQuestionsFromLearnings(learnings, originalQuery) {
    // Extract keywords from the original query
    const queryWords = originalQuery.toLowerCase().split(/\s+/);
    const keyWords = queryWords.filter(word => word.length > 3);
    
    // Create related follow-up questions based on the learnings and keywords
    const followUpQuestions = [
      "How can I resolve Zoom echo problems?",
      "What are the minimum internet requirements for Zoom?",
      "How do I test my microphone in Zoom?",
      "Why does my audio cut out during Zoom meetings?",
      "How to join Zoom audio by phone?"
    ];
    
    // Return 3-5 follow-up questions
    return followUpQuestions.slice(0, Math.min(followUpQuestions.length, 5));
  }

  // Prompt templates
  deepResearchSystemPrompt() {
    return `You are an expert research assistant capable of helping with complex information gathering and synthesis tasks.
    Your expertise includes searching for information, analyzing findings, generating targeted research questions, and producing comprehensive reports.
    Provide your responses in a clear, organized manner using markdown formatting.`;
  }

  generateInitialQueryPrompt(query, numQuestions) {
    return `My goal is to research the following topic thoroughly: "${query}"
    
    Before diving into deep research, I need to understand the key aspects of this topic.
    Please generate ${numQuestions} specific research questions to help me explore different dimensions of this topic.
    
    Format your response as a JSON object with the following structure:
    \`\`\`json
    {
      "queries": [
        "Question 1",
        "Question 2",
        "Question 3"
      ]
    }
    \`\`\`
    
    Make each question specific, focused, and designed to explore important aspects of the main topic.`;
  }

  generateFollowUpPrompt(queries, contexts) {
    return `I'm researching the following topic(s):
    ${queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}
    
    Here's what I've found so far:
    ${contexts.map((c, i) => `Source ${i + 1}: ${c}`).join('\n\n')}
    
    Based on this information, please generate follow-up questions and provide concise answers to them based on the context provided.
    
    Format your response as a JSON object with the following structure:
    \`\`\`json
    {
      "questions": [
        {
          "question": "Question 1",
          "answer": "Answer based on the provided context"
        },
        {
          "question": "Question 2",
          "answer": "Answer based on the provided context"
        }
      ]
    }
    \`\`\`
    
    Each question should explore an important aspect of the topic, and each answer should be concise but informative.`;
  }

  generateSerpQueriesPrompt(query, numQueries, learnings) {
    return `I'm conducting research on the following topic: "${query}"
    
    ${learnings && learnings.length > 0 
      ? `I've already learned the following:\n${learnings.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n` 
      : ''}
    
    Please generate ${numQueries} specific search queries that would help gather more information about this topic.
    Each query should target a specific aspect and be optimized for search engines.
    
    Format your response as a JSON object with the following structure:
    \`\`\`json
    {
      "queries": [
        {
          "query": "Specific search query 1",
          "researchGoal": "Goal or purpose of this query"
        },
        {
          "query": "Specific search query 2",
          "researchGoal": "Goal or purpose of this query"
        }
      ]
    }
    \`\`\`
    
    The query should be specific and focused, while the researchGoal explains what we hope to learn from this search.`;
  }

  processSerpResultPrompt(query, content, numLearnings, numFollowUpQuestions) {
    return `I'm researching: "${query}"
    
    Here is the content I've found:
    ${content}
    
    Please analyze this content and extract:
    1. ${numLearnings} key learnings or insights related to my research topic
    2. ${numFollowUpQuestions} follow-up questions to deepen my understanding
    
    Format your response as a JSON object with the following structure:
    \`\`\`json
    {
      "learnings": [
        "Key learning 1",
        "Key learning 2",
        "Key learning 3"
      ],
      "followUpQuestions": [
        "Follow-up question 1",
        "Follow-up question 2",
        "Follow-up question 3"
      ]
    }
    \`\`\`
    
    The learnings should capture the most important information from the content,
    and the follow-up questions should explore areas that could deepen the research.`;
  }
}
