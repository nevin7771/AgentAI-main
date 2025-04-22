// server/agents/searchWithAIAgent.js
import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";
import {
  performWebSearch,
  fetchWebContent,
  summarizeText,
} from "./utils/agentUtils.js";

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

  async execute(query) {
    try {
      if (!this.openai) {
        await this.initialize();
      }

      this.log(`Executing ${this.searchMode} search for: "${query}"`);
      this.log(`Sources: ${this.sources.join(", ")}`);

      // Select the appropriate search method based on the search mode
      let result;

      switch (this.searchMode) {
        case "research":
          result = await this.performDeepResearch(query);
          break;
        case "deep":
          result = await this.performDeepSearch(query);
          break;
        case "simple":
        default:
          result = await this.performSimpleSearch(query);
          break;
      }

      return {
        success: true,
        query,
        sources: this.sources,
        result,
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

    // Step 3: Generate answer using LLM
    const response = await this.openai.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        {
          role: "system",
          content: `You are a search assistant that provides accurate, helpful answers based on search results.
          Use the provided search context to answer the user's question.
          Always cite your sources using the citation format [[citation:X]] where X is the source number.
          If the search results don't contain enough information to answer the question confidently, acknowledge that.
          Be concise but thorough, and organize your response clearly.`,
        },
        {
          role: "user",
          content: `Question: ${query}\n\nSearch Results:\n${context}`,
        },
      ],
      temperature: 0.5,
    });

    return {
      answer: response.choices[0].message.content,
      searchResults,
      citations: searchResults.map((result) => ({
        url: result.url,
        title: result.title,
        source: result.source,
      })),
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

    // Step 5: Generate detailed answer using LLM
    const response = await this.openai.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        {
          role: "system",
          content: `You are a deep search assistant that provides comprehensive, well-structured answers based on search results and webpage content.
          Use the provided search context to thoroughly answer the user's question.
          Always cite your sources using the citation format [[citation:X]] where X is the source number.
          Organize your response with headings and bullet points where appropriate.
          Provide a detailed analysis while remaining factual and accurate.`,
        },
        {
          role: "user",
          content: `Question: ${query}\n\nSearch Results and Content:\n${context}`,
        },
      ],
      temperature: 0.4,
    });

    return {
      answer: response.choices[0].message.content,
      searchResults: contentResults,
      citations: contentResults.map((result) => ({
        url: result.url,
        title: result.title,
        source: result.source,
      })),
    };
  }

  async performDeepResearch(query) {
    // Step 1: Generate research questions
    const questionsResponse = await this.openai.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        {
          role: "system",
          content: `You are a research question generator. Based on the main query, create 3 specific sub-questions that would help fully answer the main question when researched. Make the questions specific and targeted.`,
        },
        {
          role: "user",
          content: `Main research query: ${query}\n\nGenerate 3 specific sub-questions to research:`,
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

    // Step 4: Generate comprehensive research report
    const response = await this.openai.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        {
          role: "system",
          content: `You are a comprehensive research assistant. Your task is to synthesize research findings from multiple sources into a cohesive, well-structured report.
          
          Create a detailed research report that thoroughly addresses the main question while incorporating all the research findings provided. 
          
          Format your response as a proper research report with:
          1. An executive summary
          2. Key findings organized by theme or topic
          3. Detailed analysis of each major point
          4. Conclusions and recommendations if applicable
          
          Always cite your sources using the citation format [[citation:X]] where X is the source number when referencing specific information.
          Use appropriate headings, bullet points, and formatting to create a professional, easy-to-read report.`,
        },
        {
          role: "user",
          content: `Main research question: ${query}\n\nResearch findings:\n${researchContext}`,
        },
      ],
      temperature: 0.3,
    });

    return {
      answer: response.choices[0].message.content,
      searchResults: allResults,
      subQuestions,
      citations: allResults.map((result) => ({
        url: result.url,
        title: result.title,
        source: result.source,
      })),
    };
  }

  formatResponse(data) {
    if (!data.success) {
      return `<div class="search-with-ai error">
        <h3>Search Error</h3>
        <p>Sorry, there was an error processing your search request: ${data.error}</p>
      </div>`;
    }

    const { query, result } = data;
    const { answer, citations } = result;

    // Process the answer to enhance citations and formatting
    let processedAnswer = answer;

    // Make URLs in the answer clickable
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    processedAnswer = processedAnswer.replace(
      urlRegex,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Format citation markers
    const citationRegex = /\[\[citation:(\d+)\]\]/g;
    processedAnswer = processedAnswer.replace(citationRegex, (match, p1) => {
      return `<sup class="citation-marker" data-citation="${p1}">[${p1}]</sup>`;
    });

    // Format headings and lists
    processedAnswer = processedAnswer
      .replace(/^#+\s+(.*?)$/gm, (match, p1) => `<h4>${p1}</h4>`)
      .replace(/^\*\s+(.*?)$/gm, (match, p1) => `<li>${p1}</li>`)
      .replace(/^(\d+)\.\s+(.*?)$/gm, (match, p1, p2) => `<li>${p2}</li>`);

    // Find sections with lists and wrap them
    processedAnswer = processedAnswer.replace(
      /<li>(.*?)<\/li>\n<li>/g,
      "<li>$1</li>\n<ul><li>"
    );
    processedAnswer = processedAnswer.replace(
      /<\/li>\n(?!<li>)/g,
      "</li></ul>\n"
    );

    // Create the HTML output
    let html = `
      <div class="search-with-ai-results">
        <h3>AI-Enhanced Search Results</h3>
        <p><strong>Query:</strong> "${query}"</p>
        <p><strong>Sources searched:</strong> ${data.sources.join(", ")}</p>
        
        <div class="search-with-ai-answer">
          ${processedAnswer}
        </div>
    `;

    // Add citations section
    if (citations && citations.length > 0) {
      html += `
        <div class="search-with-ai-citations">
          <h4>Sources</h4>
          <ol>
      `;

      citations.forEach((citation, index) => {
        html += `
          <li id="citation-${index + 1}">
            <a href="${citation.url}" target="_blank" rel="noopener noreferrer">
              ${citation.title}
            </a>
            <span class="citation-source">(${citation.source})</span>
          </li>
        `;
      });

      html += `</ol></div>`;
    }

    // Add research mode info if applicable
    if (this.searchMode === "research" && result.subQuestions) {
      html += `
        <div class="search-with-ai-research-info">
          <h4>Research Approach</h4>
          <p>To thoroughly answer your question, the following sub-questions were researched:</p>
          <ol>
      `;

      result.subQuestions.forEach((question) => {
        html += `<li>${question}</li>`;
      });

      html += `</ol></div>`;
    }

    // Add disclaimer
    html += `
      <div class="search-with-ai-disclaimer">
        <p><small>Note: This search was performed by an AI assistant and may not be comprehensive. Please verify important information.</small></p>
      </div>
    `;

    // Close the main div
    html += `</div>`;

    return html;
  }
}
