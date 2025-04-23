// server/agents/searchWithAIAgent.js
import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";
import {
  performWebSearch,
  fetchWebContent,
  summarizeText,
} from "./utils/agentUtils.js";

// Helper function for basic Markdown to HTML (can be moved to utils)
const markdownToHtmlSimple = (markdown) => {
  if (!markdown) return "";
  return markdown
    .replace(/^###\s+(.*$)/gim, "<h3>$1</h3>")
    .replace(/^##\s+(.*$)/gim, "<h2>$1</h2>")
    .replace(/^#\s+(.*$)/gim, "<h1>$1</h1>")
    .replace(/^\*\s+(.*$)/gim, "<li>$1</li>") // Unordered list items
    .replace(/^\d+\.\s+(.*$)/gim, "<li>$1</li>") // Ordered list items
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Bold
    .replace(/\*(.*?)\*/g, "<em>$1</em>") // Italic
    .split("\n") // Split into lines to process lists and paragraphs
    .reduce(
      (acc, line) => {
        line = line.trim();
        if (line.startsWith("<li>")) {
          if (!acc.inList) {
            // Determine list type (simple check)
            const listTag = line.match(/^<li>/) ? "ul" : "ol";
            acc.html += `\n<${listTag}>\n${line}`;
            acc.inList = true;
            acc.listTag = listTag;
          } else {
            acc.html += `\n${line}`;
          }
        } else {
          if (acc.inList) {
            acc.html += `\n</${acc.listTag}>`;
            acc.inList = false;
          }
          if (
            line.length > 0 &&
            !line.match(/^<(h[1-6]|p|div|blockquote|ul|ol)/)
          ) {
            acc.html += `\n<p>${line}</p>`; // Wrap non-list, non-header lines in <p>
          } else if (line.length > 0) {
            acc.html += `\n${line}`; // Keep existing block elements
          }
        }
        return acc;
      },
      { html: "", inList: false, listTag: "ul" }
    )
    .html.trim(); // Get final HTML
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
      // Use a generic error container or mode-specific later
      return `<div class="search-error">
        <h3>Search Error</h3>
        <p>Sorry, there was an error processing your search request: ${data.error}</p>
      </div>`;
    }

    const { query, result, sources } = data;
    const { answer, citations, searchResults } = result;

    // --- Simple Search Formatting ---
    if (this.searchMode === "simple") {
      const formattedAnswer = markdownToHtmlSimple(answer);

      return `
        <div class="simple-search-results">
          <h3>Search Results</h3>
          <p><strong>Query:</strong> "${query}"</p>
          
          <div class="simple-search-content">
            ${formattedAnswer}
          </div>
          
          <div class="simple-search-note">
            <p><small>Note: This is a simple search result. For more comprehensive research, use the Deep Research option.</small></p>
          </div>
        </div>
      `;
    }

    // --- Deep/Research Search Formatting (Google Style from previous step) ---
    else {
      let processedAnswer = answer;

      // Make URLs clickable
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      processedAnswer = processedAnswer.replace(
        urlRegex,
        '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
      );

      // Format citation markers [[citation:X]] -> <a href="#citation-X" class="citation-link">🔗</a>
      const citationRegex = /\[\[citation:(\d+)\]\]/g;
      processedAnswer = processedAnswer.replace(citationRegex, (match, p1) => {
        const citation = citations ? citations[parseInt(p1) - 1] : null;
        const citationUrl = citation ? citation.url : "#";
        return ` <a href="${citationUrl}" target="_blank" rel="noopener noreferrer" class="citation-link" title="Source ${p1}">🔗</a>`;
      });

      // Basic Markdown to HTML for deep/research
      processedAnswer = processedAnswer
        .replace(/^###\s+(.*$)/gim, "<h3>$1</h3>")
        .replace(/^##\s+(.*$)/gim, "<h2>$1</h2>")
        .replace(/^#\s+(.*$)/gim, "<h1>$1</h1>")
        .replace(/^\*\s+(.*$)/gim, "<li>$1</li>")
        .replace(/^\d+\.\s+(.*$)/gim, "<li>$1</li>")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>");

      processedAnswer = processedAnswer.replace(
        /^(<li>.*<\/li>\s*)+/gm,
        (match) => {
          const listTag = match.match(/^<li>/) ? "ul" : "ol";
          return `<${listTag}>${match}</${listTag}>`;
        }
      );

      processedAnswer = processedAnswer
        .split("\n")
        .map((line) => {
          line = line.trim();
          if (
            line.length === 0 ||
            line.match(/^<(ul|ol|li|h[1-6]|p|div|blockquote)/)
          ) {
            return line;
          }
          return `<p>${line}</p>`;
        })
        .join("\n");

      const sourcesToDisplay = searchResults || citations || [];

      return `
        <div class="search-results-container google-style">
          <div class="search-results-main">
            <div class="search-answer">
              ${processedAnswer}
            </div>
          </div>
          
          <div class="search-results-sidebar">
            <div class="search-sources">
              ${sourcesToDisplay.length > 0 ? "<h4>Sources</h4>" : ""}
              <ul>
                ${sourcesToDisplay
                  .map(
                    (source, index) => `
                  <li id="citation-${index + 1}">
                    <a href="${
                      source.url
                    }" target="_blank" rel="noopener noreferrer">
                      <span class="source-favicon"></span>
                      <span class="source-title">${source.title}</span>
                      <span class="source-url">${
                        new URL(source.url).hostname
                      }</span>
                    </a>
                  </li>
                `
                  )
                  .join("")}
              </ul>
            </div>
          </div>
        </div>
      `;
    }
  }
}
