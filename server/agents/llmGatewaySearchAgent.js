// server/agents/llmGatewaySearchAgent.js - CRITICAL FIX: Remove markdown formatting issues
import BaseAgent from "./baseAgent.js";
import llmGatewayService from "../services/llmGatewayService.js";

export default class LLMGatewaySearchAgent extends BaseAgent {
  constructor(options = {}) {
    super({ ...options, agentType: "llm-gateway-search" });
    this.name = "LLM Gateway Search Agent";
    this.description = "Uses internal LLM gateway with web search capabilities";
    this.sources = options.sources || [
      "support.zoom.us",
      "community.zoom.us",
      "zoom.us",
    ];
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 2000; // Base delay in ms
  }

  async initialize() {
    // Validate that the LLM Gateway service has a token
    try {
      llmGatewayService.validateToken();
      return true;
    } catch (error) {
      throw new Error(`LLM Gateway initialization failed: ${error.message}`);
    }
  }

  async execute(query) {
    try {
      await this.initialize();

      this.log(`Executing LLM Gateway search for: "${query}"`);

      // Call the LLM Gateway service with web search enabled
      const response = await llmGatewayService.query(query, [], {
        useWebSearch: true,
        sources: this.sources,
      });

      // Process the response
      if (response.status && response.status !== "success") {
        throw new Error(
          `LLM Gateway returned error: ${
            response.error_message || "Unknown error"
          }`
        );
      }

      // CRITICAL FIX: Extract the answer text properly
      let answerText = "";
      if (response.content) {
        answerText = response.content;
      } else if (response.result) {
        answerText = response.result;
      } else if (response.text) {
        answerText = response.text;
      } else if (response.message) {
        answerText = response.message;
      } else {
        answerText = "No response content found.";
      }

      // CRITICAL FIX: Clean up the answer text to remove markdown artifacts
      answerText = this.cleanAnswerText(answerText);

      // Extract sources from the answer text
      const sources = llmGatewayService.extractSources(answerText);

      return {
        success: true,
        query,
        answer: answerText,
        sources: sources,
        rawResponse: response,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // CRITICAL FIX: Clean up answer text to remove markdown artifacts
  cleanAnswerText(text) {
    if (!text || typeof text !== "string") {
      return text;
    }

    // Remove any stray markdown that wasn't processed properly
    let cleanedText = text
      // Remove markdown headers that weren't converted
      .replace(/^#{1,6}\s*/gm, "")
      // Remove bold/italic markers that weren't converted
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      // Remove code block markers
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      // Clean up extra whitespace
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s+$/gm, "")
      .trim();

    return cleanedText;
  }

  formatResponse(result) {
    if (!result.success) {
      return `<div class="llm-gateway-search-results error">
        <h3>Search Error</h3>
        <p>Sorry, there was an error processing your request: ${result.error}</p>
      </div>`;
    }

    // CRITICAL FIX: Process the answer text to convert basic formatting
    const processedAnswer = this.processAnswerForDisplay(result.answer);

    // Format the answer with proper HTML
    return `
      <div class="llm-gateway-search-results">
        <div class="search-answer-container">
          ${processedAnswer}
        </div>
        
        ${
          result.sources && result.sources.length > 0
            ? `
          <div class="search-sources">
            <h4>Sources (${result.sources.length})</h4>
            <ul>
              ${result.sources
                .map(
                  (source) => `
                <li>
                  <a href="${
                    source.url
                  }" target="_blank" rel="noopener noreferrer">${
                    source.title || source.url
                  }</a>
                  ${source.snippet ? `<p>${source.snippet}</p>` : ""}
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  // CRITICAL FIX: Process answer text for proper display
  processAnswerForDisplay(text) {
    if (!text || typeof text !== "string") {
      return text;
    }

    // Convert basic text formatting to HTML
    let processedText = text
      // Convert line breaks to paragraphs
      .split("\n\n")
      .filter((para) => para.trim().length > 0)
      .map((para) => {
        // Handle numbered lists
        if (/^\d+\.\s/.test(para.trim())) {
          const items = para
            .split(/(?=\n\d+\.\s)/)
            .filter((item) => item.trim());
          if (items.length > 1) {
            return `<ol>${items
              .map((item) => `<li>${item.replace(/^\d+\.\s/, "").trim()}</li>`)
              .join("")}</ol>`;
          } else {
            return `<p>${para.trim()}</p>`;
          }
        }
        // Handle bullet lists
        else if (/^[-*]\s/.test(para.trim())) {
          const items = para
            .split(/(?=\n[-*]\s)/)
            .filter((item) => item.trim());
          if (items.length > 1) {
            return `<ul>${items
              .map((item) => `<li>${item.replace(/^[-*]\s/, "").trim()}</li>`)
              .join("")}</ul>`;
          } else {
            return `<p>${para.trim()}</p>`;
          }
        }
        // Handle regular paragraphs
        else {
          return `<p>${para.trim()}</p>`;
        }
      })
      .join("");

    // Handle inline formatting
    processedText = processedText
      // Convert **bold** to <strong>
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      // Convert *italic* to <em>
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      // Convert single line breaks to <br> within paragraphs
      .replace(/<p>([^<]*)\n([^<]*)<\/p>/g, "<p>$1<br>$2</p>");

    return processedText;
  }
}
