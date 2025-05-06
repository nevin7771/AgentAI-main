// server/agents/searchWithAIAgent.js
import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";
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

export default class SearchWithAIAgent extends BaseAgent {
  constructor(options = {}) {
    super({
      agentType: "search-with-ai",
      ...options,
    });
    this.name = "Search with AI Agent";
    this.description =
      "Performs advanced search with AI reasoning using the RAG approach";
    this.sources = options.sources || [
      "support.zoom.us",
      "community.zoom.us",
      "zoom.us",
    ];
    this.openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    this.openai = null;
    this.maxResults = options.maxResults || 5;
    this.searchMode = options.searchMode || "simple"; // Options: simple, deep, research
  }

  async initialize() {
    if (!this.openaiApiKey) {
      throw new Error(
        "OpenAI API key is required for the Search with AI Agent"
      );
    }

    this.openai = new OpenAI({
      apiKey: this.openaiApiKey,
    });

    return true;
  }

  async execute(query, options = {}) {
    try {
      if (!this.openai) {
        await this.initialize();
      }

      // Override search mode if provided in options
      const currentSearchMode = options.searchMode || this.searchMode;

      this.log(`Executing ${currentSearchMode} search for: "${query}"`);
      this.log(`Sources: ${this.sources.join(", ")}`);

      // Select the appropriate search method based on the search mode
      let resultData;

      switch (currentSearchMode) {
        case "research":
          resultData = await this.performDeepResearch(query);
          break;
        case "deep":
          resultData = await this.performDeepSearch(query);
          break;
        case "simple":
        default:
          resultData = await this.performSimpleSearch(query);
          break;
      }

      // **Generate follow-up questions**
      const followUpQuestions = await generateFollowUpQuestions(
        query,
        resultData.answer, // Use the generated answer text
        this.openai // Pass the initialized OpenAI instance
      );

      // Standardized structured response
      return {
        success: true,
        query,
        searchMode: currentSearchMode,
        structuredAnswer: resultData.answer, // LLM should provide structured markdown
        keywords: resultData.keywords || [],
        sources: resultData.sources || [],
        followUpQuestions: followUpQuestions, // Include generated questions
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  async performSimpleSearch(query) {
    // Step 1: Get search results
    const searchResults = await performWebSearch(
      query,
      this.sources,
      this.maxResults
    );
    this.log(`Found ${searchResults.length} search results`);

    // Step 2: Construct context from search results
    const context = searchResults
      .map(
        (result, index) =>
          `[[citation:${index + 1}]] ${result.title}\nURL: ${result.url}\n${
            result.snippet
          }`
      )
      .join("\n\n");

    // Step 3: Generate answer using LLM - **MODIFIED PROMPT**
    const systemPrompt = `You are a search assistant. Provide a concise, structured answer to the user's question based ONLY on the provided search results. 
Use Markdown for formatting (headings, lists, bold text). 
Identify the main topic and key steps or points. 
Cite sources using [[citation:X]]. 
If the context is insufficient, state that clearly.`;

    const userPrompt = `Question: ${query}\n\nSearch Results:\n${context}`;

    const response = await this.openai.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.5,
    });

    const answerText = response.choices[0].message.content;
    const keywords = extractKeywords(answerText);

    // Prepare sources with keywords
    const sourcesWithKeywords = searchResults.map((result) => ({
      url: result.url,
      title: result.title,
      snippet: result.snippet,
      keywordsInSnippet: extractKeywords(result.snippet, 3),
    }));

    return {
      answer: answerText, // Structured markdown from LLM
      keywords: keywords,
      sources: sourcesWithKeywords,
    };
  }

  async performDeepSearch(query) {
    // Step 1: Get search results
    const searchResults = await performWebSearch(
      query,
      this.sources,
      this.maxResults
    );
    this.log(`Found ${searchResults.length} search results`);

    // Step 2: Fetch content from top results
    const contentResults = [];
    for (const result of searchResults.slice(0, 3)) {
      try {
        const content = await fetchWebContent(result.url);
        contentResults.push({
          ...result,
          content: content,
        });
        this.log(`Fetched content from ${result.url}`);
      } catch (error) {
        this.log(`Error fetching content from ${result.url}: ${error.message}`);
      }
    }

    // Step 3: Summarize each content
    for (let i = 0; i < contentResults.length; i++) {
      if (contentResults[i].content) {
        try {
          const summary = await summarizeText(
            contentResults[i].content,
            this.openai
          );
          contentResults[i].summary = summary;
          this.log(`Summarized content from ${contentResults[i].url}`);
        } catch (error) {
          this.log(
            `Error summarizing content from ${contentResults[i].url}: ${error.message}`
          );
          contentResults[i].summary = contentResults[i].snippet;
        }
      }
    }

    // Step 4: Construct rich context from search results and content
    const context = contentResults
      .map(
        (result, index) =>
          `[[citation:${index + 1}]] ${result.title}\nURL: ${result.url}\n${
            result.summary || result.snippet
          }`
      )
      .join("\n\n");

    // Step 5: Generate detailed answer using LLM - **MODIFIED PROMPT**
    const systemPrompt = `You are a deep search assistant. Provide a comprehensive, well-structured answer based ONLY on the provided search results and summaries. 
Use Markdown for clear formatting (headings, lists, bold text). 
Structure the answer logically (e.g., introduction, key points/steps, conclusion). 
Cite sources using [[citation:X]]. 
If the context is insufficient, state that clearly.`;

    const userPrompt = `Question: ${query}\n\nSearch Results and Content Summaries:\n${context}`;

    const response = await this.openai.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
    });

    const answerText = response.choices[0].message.content;
    const keywords = extractKeywords(answerText);

    // Prepare sources with keywords
    const sourcesWithKeywords = contentResults.map((result) => ({
      url: result.url,
      title: result.title,
      snippet: result.summary || result.snippet, // Use summary if available
      keywordsInSnippet: extractKeywords(result.summary || result.snippet, 3),
    }));

    return {
      answer: answerText, // Structured markdown from LLM
      keywords: keywords,
      sources: sourcesWithKeywords,
    };
  }

  async performDeepResearch(query) {
    // Step 1: Generate research questions
    const questionsResponse = await this.openai.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        {
          role: "system",
          content: `You are a research question generator. Based on the main query, create 3 specific sub-questions that would help fully answer the main question when researched. Make the questions specific and targeted. Return only the questions, numbered.`, // Simplified prompt
        },
        {
          role: "user",
          content: `Main research query: ${query}\n\nGenerate 3 specific sub-questions to research:`, // Simplified prompt
        },
      ],
      temperature: 0.7,
    });

    const subQuestionsText = questionsResponse.choices[0].message.content;
    const subQuestions = subQuestionsText
      .split(/\d+\.\s+/)
      .filter((q) => q.trim().length > 0);
    this.log(`Generated ${subQuestions.length} research sub-questions`);

    // Step 2: Research each question (including the main query)
    const researchQuestions = [query, ...subQuestions];
    const allResults = [];

    for (const researchQ of researchQuestions) {
      const searchResults = await performWebSearch(researchQ, this.sources, 3);
      this.log(
        `Found ${
          searchResults.length
        } results for sub-question: "${researchQ.substring(0, 30)}..."`
      );

      // Fetch content from search results
      for (const result of searchResults) {
        try {
          const content = await fetchWebContent(result.url);
          const summary = await summarizeText(content, this.openai);

          allResults.push({
            question: researchQ,
            title: result.title,
            url: result.url,
            source: result.source,
            summary,
          });

          this.log(`Processed content from ${result.url}`);
        } catch (error) {
          this.log(
            `Error processing content from ${result.url}: ${error.message}`
          );
        }
      }
    }

    // Step 3: Construct comprehensive research context
    const researchContext = allResults
      .map(
        (result, index) =>
          `[[citation:${index + 1}]] From research on "${
            result.question
          }"\nSource: ${result.title} (${result.source})\nURL: ${
            result.url
          }\nSummary: ${result.summary}`
      )
      .join("\n\n");

    // Step 4: Generate comprehensive research report - **MODIFIED PROMPT**
    const systemPrompt = `You are a comprehensive research assistant. Synthesize the research findings into a cohesive, well-structured report answering the main question. 
Use Markdown for clear formatting (headings, lists, bold text). 
Structure the report logically (e.g., summary, key findings by theme, details, conclusion). 
Cite sources using [[citation:X]]. 
Focus on accuracy and clarity, using ONLY the provided context.`;

    const userPrompt = `Main research question: ${query}\n\nResearch findings:\n${researchContext}`;

    const response = await this.openai.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    const answerText = response.choices[0].message.content;
    const keywords = extractKeywords(answerText);

    // Prepare sources with keywords
    const sourcesWithKeywords = allResults.map((result) => ({
      url: result.url,
      title: result.title,
      snippet: result.summary, // Use summary for research mode
      keywordsInSnippet: extractKeywords(result.summary, 3),
    }));

    return {
      answer: answerText, // Structured markdown from LLM
      keywords: keywords,
      sources: sourcesWithKeywords,
      subQuestions: subQuestions, // Include sub-questions in the result
    };
  }

  // REMOVED formatResponse method - formatting is now frontend responsibility
}
