// server/agents/llmGatewaySearchAgent.js - COMPLETE FIX: Remove HTML wrappers
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

      // CRITICAL FIX: Extract the answer text properly and clean it
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

      // CRITICAL FIX: Clean up the answer text completely
      answerText = this.cleanAnswerText(answerText);

      // Extract sources from the answer text
      const sources = llmGatewayService.extractSources(answerText);

      return {
        success: true,
        query,
        answer: answerText, // CRITICAL: Return clean text, not HTML
        sources: sources,
        rawResponse: response,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // CRITICAL FIX: Comprehensive text cleaning
  cleanAnswerText(text) {
    if (!text || typeof text !== "string") {
      return text;
    }

    // Remove any HTML tags and content
    let cleanedText = text
      // Remove any div wrappers that might be causing issues
      .replace(/<div[^>]*>/gi, "")
      .replace(/<\/div>/gi, "")
      // Remove other HTML tags
      .replace(/<[^>]*>/g, "")
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

  // CRITICAL FIX: Return plain text, not HTML
  formatResponse(result) {
    if (!result.success) {
      return `Search Error: ${result.error}`;
    }

    // CRITICAL FIX: Return just the text content without any HTML wrappers
    let formattedText = result.answer || "";

    // Add sources as plain text if available
    if (result.sources && result.sources.length > 0) {
      formattedText += "\n\nSources:\n";
      result.sources.forEach((source, index) => {
        formattedText += `${index + 1}. ${source.title || source.url}\n`;
        if (source.url) {
          formattedText += `   ${source.url}\n`;
        }
        if (source.snippet) {
          formattedText += `   ${source.snippet}\n`;
        }
        formattedText += "\n";
      });
    }

    return formattedText.trim();
  }
}
