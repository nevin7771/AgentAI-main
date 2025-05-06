// server/agents/ragSearchAgent.js
// Implementation of a RAG (Retrieval-Augmented Generation) based search agent

import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";
import fetch from "node-fetch";
import { load } from "cheerio";
import {
  performWebSearch, // Use the same utility
  fetchWebContent, // Use the same utility
  summarizeText, // Use the same utility
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
          // Ensure cached result matches the new structure
          return {
            success: true,
            query: cachedResult.query,
            searchMode: "rag",
            structuredAnswer: cachedResult.structuredAnswer, // Use the correct field name
            keywords: cachedResult.keywords || [],
            sources: cachedResult.sources || [], // Use the correct field name
            followUpQuestions: cachedResult.followUpQuestions || [],
            usedCache: true, // Indicate cache usage
          };
        }
      }

      this.log(`Executing RAG search for: "${query}"`);

      // 1. Retrieve relevant search results using the utility function
      const searchResults = await performWebSearch(
        query,
        this.sources,
        this.maxResultsPerSource * this.sources.length
      );
      this.log(`Found ${searchResults.length} search results`);

      // 2. Extract and process content from search results
      const processedResults = await this.processSearchResults(searchResults);
      this.log(`Processed ${processedResults.length} results for content`);

      // 3. Generate answer using RAG approach
      const ragOutput = await this.generateRagAnswer(query, processedResults);

      // **Generate follow-up questions**
      const followUpQuestions = await generateFollowUpQuestions(
        query,
        ragOutput.answerText, // Use the generated answer text
        this.openai // Pass the initialized OpenAI instance
      );

      // Prepare sources with keywords
      const sourcesWithKeywords = processedResults.map((result) => ({
        url: result.url,
        title: result.title,
        snippet: result.extractedContent, // Use extracted/summarized content
        keywordsInSnippet: extractKeywords(result.extractedContent, 3),
      }));

      // Standardized structured response
      const finalResult = {
        success: true,
        query,
        searchMode: "rag",
        structuredAnswer: ragOutput.answerText, // Structured markdown from LLM
        keywords: ragOutput.keywords || [],
        sources: sourcesWithKeywords,
        followUpQuestions: followUpQuestions, // Include generated questions
      };

      // Store in cache if enabled (store the new structured format)
      if (this.cacheEnabled) {
        const cacheKey = this.getCacheKey(query);
        // Adapt the cached data structure if needed, here we assume finalResult is suitable
        this.storeInCache(cacheKey, finalResult);
      }

      return finalResult;
    } catch (error) {
      this.log("Error during execution:", error);
      return this.handleError(error);
    }
  }

  // Removed performSearch - now uses performWebSearch utility

  async processSearchResults(searchResults) {
    const processedResults = [];

    for (const result of searchResults.slice(0, 5)) {
      // Limit processing to top 5
      try {
        // Extract content from the page using utility
        const content = await fetchWebContent(result.url);
        // Summarize the content using utility
        const summary = await summarizeText(
          content,
          this.openai,
          this.maxContentLength
        );

        processedResults.push({
          ...result,
          extractedContent: summary, // Store the summary
        });
      } catch (error) {
        this.log(`Error processing result (${result.url}):`, error);
        // Include the result anyway, just with snippet
        processedResults.push({
          ...result,
          extractedContent: result.snippet || "",
        });
      }
    }

    return processedResults;
  }

  // Removed extractPageContent - now uses fetchWebContent + summarizeText utilities

  async generateRagAnswer(query, processedResults) {
    this.log("Generating RAG answer for query:", query);

    // Prepare context from the search results
    const context = this.prepareContext(processedResults);

    // Create prompt for RAG generation - **MODIFIED PROMPT**
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

    const answerText = response.choices[0].message.content;
    const keywords = extractKeywords(answerText);

    return {
      answerText, // Structured markdown from LLM
      keywords,
    };
  }

  prepareContext(processedResults) {
    // Extract and format content from processed results
    let contextText = "";
    let totalLength = 0;

    for (const [index, result] of processedResults.entries()) {
      // Use citation number based on index
      const resultText = `
[[citation:${index + 1}]]
URL: ${result.url}
TITLE: ${result.title}
CONTENT SUMMARY: ${result.extractedContent}
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
      .map((r, index) => `[${index + 1}] ${r.url}`)
      .join("\n");

    // **MODIFIED SYSTEM PROMPT**
    const systemPrompt = `You are a Research Assistant. Provide an accurate, helpful, and structured answer based ONLY on the provided search result summaries. 
Use Markdown for formatting (headings, lists, bold text). 
Structure the answer logically (e.g., summary, key points/steps). 
Cite sources using [[citation:X]] where X corresponds to the source number. 
If the context is insufficient, state that clearly.`;

    // **MODIFIED USER PROMPT**
    const userPrompt = `QUERY: ${query}

SEARCH RESULT SUMMARIES:
${context}

Based ONLY on the summaries above, provide a comprehensive, structured answer to the query using Markdown. Include citations [[citation:X]].`;

    return {
      system: systemPrompt,
      user: userPrompt,
    };
  }

  getCacheKey(query) {
    // Simple cache key based on the query and sources
    return `rag_${query}_${this.sources.join("_")}`;
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
      data, // Store the new structured data
    });
  }

  // Removed simulateSearch and simulateContentExtraction - using utilities now

  // REMOVED formatResponse method - formatting is now frontend responsibility
}
