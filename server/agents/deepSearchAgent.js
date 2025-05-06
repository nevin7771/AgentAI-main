// server/agents/deepSearchAgent.js
// Enhanced implementation using RAG and Deep Research patterns

import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";
import axios from "axios";
import * as cheerio from "cheerio";
import {
  performWebSearch,
  fetchWebContent,
  summarizeText,
  generateFollowUpQuestions, // Import the new utility
} from "./utils/agentUtils.js";

// Helper function to extract keywords (simple example)
const extractKeywords = (text, count = 5) => {
  if (!text) return [];
  // Simple keyword extraction: split by space, filter common words, count frequency
  const commonWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "and",
    "or",
    "it",
    "this",
    "that",
    "you",
    "i",
    "me",
    "my",
    "your",
    "with",
    "as",
    "by",
    "if",
    "how",
    "what",
    "when",
    "where",
    "why",
  ]);
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];
  const freq = {};
  words.forEach((word) => {
    if (!commonWords.has(word) && word.length > 2) {
      freq[word] = (freq[word] || 0) + 1;
    }
  });
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, count)
    .map(([word]) => word);
};

export default class DeepSearchAgent extends BaseAgent {
  constructor(options = {}) {
    super({ ...options, agentType: "deep-search" }); // Set agentType
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
      this.visitedUrls.clear(); // Clear visited URLs for each execution

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
      const reportData = await this.generateReport(query, researchResults);

      // **Generate follow-up questions**
      const followUpQuestions = await generateFollowUpQuestions(
        query,
        reportData.reportText, // Use the generated report text
        this.openai // Pass the initialized OpenAI instance
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Standardized structured response
      return {
        success: true,
        query,
        searchMode: "deep", // Indicate search mode
        structuredAnswer: reportData.reportText, // Structured markdown from LLM
        keywords: reportData.keywords || [],
        sources: reportData.sourcesWithKeywords || [],
        followUpQuestions: followUpQuestions, // Include generated questions
        // Optional debug info:
        // executionTimeMs: executionTime,
        // enhancedQueries,
        // visitedUrls: Array.from(this.visitedUrls),
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Generate improved search queries based on the original query
   */
  async generateEnhancedQueries(query) {
    const systemPrompt = `You are an expert researcher. Analyze the original query and generate ${this.breadth} different search queries to gather comprehensive information. Make each query specific and targeted. Return only the queries, numbered.`; // Simplified prompt

    const userPrompt = `Original query: "${query}"
Generate ${this.breadth} different search queries:`; // Simplified prompt

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.defaultModel || "gpt-4", // Use configured model
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
    const allLearnings = []; // Store { url, title, content } objects
    let currentDepth = 0;

    // Start with enhanced queries as the initial queries
    let currentQueries = enhancedQueries.slice(0, breadth);

    while (currentDepth < depth && currentQueries.length > 0) {
      console.log(`[${this.name}] Research depth ${currentDepth + 1}/${depth}`);

      const nextLevelQueries = new Set();

      // Process each query at current depth level
      for (const currentQuery of currentQueries) {
        try {
          // Search for results
          const searchResults = await this.performSearch(currentQuery);

          // Extract content from top results
          const extractedContents = await this.extractContentFromResults(
            searchResults
          );
          allLearnings.push(...extractedContents); // Add content directly

          // Process content to generate follow-up queries (optional)
          // For simplicity, we'll skip generating follow-up queries from content here
          // and rely on the initial enhanced queries.
        } catch (error) {
          console.error(`[Error researching query "${currentQuery}"]`, error);
        }
      }

      // Move to next depth (currently no new queries generated from content)
      currentDepth++;
      currentQueries = []; // Stop after initial depth for now
    }

    // Deduplicate learnings based on URL
    const uniqueLearnings = Array.from(
      new Map(allLearnings.map((item) => [item.url, item])).values()
    );

    return {
      learnings: uniqueLearnings,
      visitedUrls: Array.from(this.visitedUrls),
    };
  }

  /**
   * Perform search using domain-specific search
   */
  async performSearch(query) {
    console.log(`[${this.name}] Searching for: "${query}"`);
    // Use the utility function from searchWithAIAgent for consistency
    const results = await performWebSearch(query, this.sources, this.breadth);
    return results;
  }

  /**
   * Extract content from search results
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

        // Use the utility function for consistency
        const content = await fetchWebContent(result.url);
        const summary = await summarizeText(content, this.openai); // Summarize fetched content

        contents.push({
          url: result.url,
          title: result.title,
          content: summary, // Store the summary
          source: result.source, // Include source domain
        });
      } catch (error) {
        console.error(
          `[Error extracting/summarizing content from ${result.url}]`,
          error
        );
        // Optionally add result with snippet if fetching/summarizing fails
        if (!this.visitedUrls.has(result.url)) {
          this.visitedUrls.add(result.url);
          contents.push({
            url: result.url,
            title: result.title,
            content: result.snippet, // Fallback to snippet
            source: result.source,
          });
        }
      }
    }
    return contents;
  }

  /**
   * Generate final comprehensive report based on all findings
   */
  async generateReport(originalQuery, researchResults) {
    const { learnings } = researchResults;

    if (learnings.length === 0) {
      return {
        reportText:
          "No significant findings were discovered. Please try a different search query.",
        keywords: [],
        sourcesWithKeywords: [],
      };
    }

    // Prepare context for the final report generation
    const reportContext = learnings
      .map(
        (learning, index) =>
          `[[citation:${index + 1}]] Source: ${learning.title} (${
            learning.source
          })\nURL: ${learning.url}\nSummary: ${learning.content}` // Use summarized content
      )
      .join("\n\n");

    const systemPrompt = `You are a professional research analyst. Create a comprehensive, well-organized report answering the main query based ONLY on the provided summaries. 
Use Markdown for clear formatting (headings, lists, bold text). 
Structure the report logically (e.g., summary, key findings by theme, details, conclusion). 
Cite sources using [[citation:X]]. 
Focus on accuracy and clarity.`;

    const userPrompt = `
Main research query: "${originalQuery}"

Research Findings (Summaries):
${reportContext}

Generate the comprehensive report using Markdown.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.defaultModel || "gpt-4", // Use configured model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for factual report
      });

      const reportText = response.choices[0].message.content;
      const keywords = extractKeywords(reportText);

      // Prepare sources with keywords
      const sourcesWithKeywords = learnings.map((learning) => ({
        url: learning.url,
        title: learning.title,
        snippet: learning.content, // Use summary as snippet
        keywordsInSnippet: extractKeywords(learning.content, 3),
      }));

      return {
        reportText,
        keywords,
        sourcesWithKeywords,
      };
    } catch (error) {
      console.error("[Error generating final report]", error);
      throw new Error("Failed to generate the final research report.");
    }
  }

  // REMOVED formatResponse method - formatting is now frontend responsibility
}
