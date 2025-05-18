// server/agents/llmGatewaySearchAgent.js
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
      if (response.status !== "success") {
        throw new Error(
          `LLM Gateway returned error: ${
            response.error_message || "Unknown error"
          }`
        );
      }

      // Extract the answer text
      const answerText = response.result || "";

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

  formatResponse(result) {
    if (!result.success) {
      return `<div class="llm-gateway-search-results error">
        <h3>Search Error</h3>
        <p>Sorry, there was an error processing your request: ${result.error}</p>
      </div>`;
    }

    // Format the answer with proper HTML
    return `
      <div class="llm-gateway-search-results">
        <div class="search-answer-container">
          ${result.answer}
        </div>
        
        ${
          result.sources && result.sources.length > 0
            ? `
          <div class="search-sources">
            <h4>Sources</h4>
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
}
