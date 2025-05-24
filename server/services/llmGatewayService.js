// server/services/llmGatewayService.js
import axios from "axios";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

class LLMGatewayService {
  constructor() {
    this.apiUrl =
      process.env.LLM_GATEWAY_URL ||
      "https://llm-gateway-zmdev-aws-us-east-1.ai.zoomdev.us/v1/chat-bot/invoke";
    this.token = process.env.LLM_GATEWAY_JWT_TOKEN;
    this.defaultModel = process.env.LLM_MODEL || "claude-3-7-sonnet-20250219";
  }

  /**
   * Validate if token exists
   */
  validateToken() {
    if (!this.token) {
      throw new Error(
        "LLM Gateway JWT Token not found. Please restart the server to generate a token."
      );
    }
  }

  async query(query, chatHistory = [], options = {}) {
    // Refresh token from environment in case it was updated
    this.token = process.env.LLM_GATEWAY_JWT_TOKEN;

    console.log(`[LLMGatewayService] Starting query...`);
    console.log(`[LLMGatewayService] API URL:`, this.apiUrl);
    console.log(`[LLMGatewayService] Token exists:`, !!this.token);
    console.log(`[LLMGatewayService] Token length:`, this.token?.length || 0);
    console.log(
      `[LLMGatewayService] Model:`,
      options.model || this.defaultModel
    );

    this.validateToken();

    // Format messages for the API
    const messages = [];

    // Add chat history if provided
    if (chatHistory && chatHistory.length > 0) {
      for (const message of chatHistory) {
        messages.push({
          role: message.role || (message.isUser ? "user" : "assistant"),
          message: message.content || message.text || message.message,
        });
      }
    }

    // Add current query as the latest message
    messages.push({
      role: "user",
      message: query,
    });

    // Create request payload
    const payload = {
      model: options.model || this.defaultModel,
      messages: messages,
      task_id: options.taskId || `task_${Date.now()}`,
      user_name: options.userName || "jira_agent",
    };

    console.log(
      `[LLMGatewayService] Request payload:`,
      JSON.stringify(payload, null, 2)
    );

    try {
      console.log(`[LLMGatewayService] Making API call...`);

      const response = await axios.post(this.apiUrl, payload, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        timeout: options.timeout || 30000,
      });

      console.log(`[LLMGatewayService] Response status:`, response.status);
      console.log(`[LLMGatewayService] Response headers:`, response.headers);
      console.log(`[LLMGatewayService] Response data:`, response.data);
      console.log(
        `[LLMGatewayService] Response data type:`,
        typeof response.data
      );

      // Check if response.data has expected structure
      if (!response.data) {
        throw new Error("LLM Gateway returned empty response data");
      }

      // Check for different possible response formats
      if (response.data.content) {
        console.log(
          `[LLMGatewayService] Found content field:`,
          response.data.content
        );
      } else if (response.data.text) {
        console.log(
          `[LLMGatewayService] Found text field:`,
          response.data.text
        );
        // Normalize to expected format
        response.data.content = response.data.text;
      } else if (response.data.message) {
        console.log(
          `[LLMGatewayService] Found message field:`,
          response.data.message
        );
        // Normalize to expected format
        response.data.content = response.data.message;
      } else if (response.data.response) {
        console.log(
          `[LLMGatewayService] Found response field:`,
          response.data.response
        );
        // Normalize to expected format
        response.data.content = response.data.response;
      } else {
        console.warn(
          `[LLMGatewayService] No recognized content field in response:`,
          Object.keys(response.data)
        );
        // Try to use the first string field
        const stringFields = Object.entries(response.data).filter(
          ([key, value]) => typeof value === "string" && value.length > 0
        );

        if (stringFields.length > 0) {
          console.log(
            `[LLMGatewayService] Using first string field: ${stringFields[0][0]}`
          );
          response.data.content = stringFields[0][1];
        } else {
          throw new Error(
            `LLM Gateway returned unexpected response format: ${JSON.stringify(
              response.data
            )}`
          );
        }
      }

      return response.data;
    } catch (error) {
      console.error("[LLMGatewayService] Error calling LLM Gateway:", error);

      if (error.response) {
        console.error(
          "[LLMGatewayService] Error response status:",
          error.response.status
        );
        console.error(
          "[LLMGatewayService] Error response data:",
          error.response.data
        );
      }

      throw error;
    }
  }
  /**
   * Call the LLM Gateway with a query
   * @param {string} query - The user's query
   * @param {Array} chatHistory - Optional chat history
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - The response from the LLM Gateway
   */
  async query(query, chatHistory = [], options = {}) {
    // Refresh token from environment in case it was updated
    this.token = process.env.LLM_GATEWAY_JWT_TOKEN;
    this.validateToken();

    // Format messages for the API
    const messages = [];

    // Add system message for web search instructions
    if (options.useWebSearch) {
      messages.push({
        role: "system",
        message: `You are a helpful assistant with access to web search. 
When answering, please:
1. Use web_search tool to find relevant information when needed
2. Focus searches on these domains when relevant: ${
          options.sources
            ? options.sources.join(", ")
            : "zoom.us, support.zoom.us"
        }
3. Format your response in Markdown
4. ALWAYS include sources for your information using one of these formats:
   - Include URLs directly in your response: https://example.com
   - Use markdown links: [Link text](https://example.com)
   - Add a numbered sources section at the end: [1]: https://example.com
5. Do not mention "web search" or "searching" in your response
6. If answering a technical question, include specific steps from official documentation`,
      });
    }

    // Add chat history if provided
    if (chatHistory && chatHistory.length > 0) {
      for (const message of chatHistory) {
        messages.push({
          role: message.role || (message.isUser ? "user" : "assistant"),
          message: message.content || message.text || message.message,
        });
      }
    }

    // Add current query as the latest message
    messages.push({
      role: "user",
      message: query,
    });

    // Create request payload
    const payload = {
      model: options.model || this.defaultModel,
      messages: messages,
      task_id: options.taskId || `task_${Date.now()}`,
      user_name: options.userName || "simplesearch",
    };

    try {
      // Create axios request with timeout and retries
      const maxRetries = options.maxRetries || 3;
      let retries = 0;
      let lastError = null;

      while (retries <= maxRetries) {
        try {
          const response = await axios.post(this.apiUrl, payload, {
            headers: {
              Authorization: `Bearer ${this.token}`,
              "Content-Type": "application/json",
            },
            timeout: options.timeout || 30000, // 30 second timeout
          });

          return response.data;
        } catch (error) {
          lastError = error;

          // Check if it's a rate limit error or authorization error
          if (
            error.response?.status === 429 ||
            (error.response?.data?.error_message &&
              (error.response.data.error_message.includes("rate limit") ||
                error.response.data.error_message.includes(
                  "trim this recording"
                )))
          ) {
            retries++;

            if (retries <= maxRetries) {
              // Exponential backoff
              const delay = Math.pow(2, retries) * 1000;
              console.log(
                `Rate limit hit. Retrying in ${
                  delay / 1000
                }s (attempt ${retries}/${maxRetries})`
              );
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
          } else if (
            error.response?.status === 401 ||
            error.response?.status === 403
          ) {
            // Token might be expired, try to get a new one
            console.log(
              "Authorization error - token might be expired. Aborting request."
            );
            throw new Error(`Authorization error: ${error.message}`);
          }

          // For other errors, just throw
          throw error;
        }
      }

      // If we get here, we've exceeded max retries
      throw lastError || new Error("Max retries exceeded");
    } catch (error) {
      console.error("Error calling LLM Gateway:", error);
      throw error;
    }
  }

  // server/services/llmGatewayService.js - Update the extractSources method

  /**
   * Extract sources from the response text
   * @param {string} text - The response text
   * @returns {Array} - Array of extracted sources
   */
  extractSources(text) {
    const sources = [];

    // Match URLs in the text
    const urlRegex = /(https?:\/\/[^\s\)\]\"\']+)/g;
    let urls = text.match(urlRegex) || [];

    // Match markdown-style links [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g;
    let markdownMatch;
    while ((markdownMatch = markdownLinkRegex.exec(text)) !== null) {
      const title = markdownMatch[1];
      const url = markdownMatch[2];

      sources.push({
        title: title,
        url: url,
        snippet: `Link text: ${title}`,
      });

      // Remove this URL from the generic URLs list to avoid duplicates
      urls = urls.filter((u) => u !== url);
    }

    // Look for citation-style references with URLs
    // Format: [number]: http://example.com or [number] http://example.com
    const citationRegex = /\[(\d+)\](?:\s*:)?\s*(https?:\/\/[^\s\)]+)/g;
    let citationMatch;
    while ((citationMatch = citationRegex.exec(text)) !== null) {
      const number = citationMatch[1];
      const url = citationMatch[2];

      sources.push({
        title: `Citation [${number}]`,
        url: url,
        snippet: `Referenced as [${number}] in the text`,
      });

      // Remove this URL from the generic URLs list to avoid duplicates
      urls = urls.filter((u) => u !== url);
    }

    // Add any remaining URLs that weren't part of markdown links or citations
    urls.forEach((url) => {
      try {
        const hostname = new URL(url).hostname;

        // Check if this URL is already in sources
        const isAlreadyAdded = sources.some((source) => source.url === url);
        if (!isAlreadyAdded) {
          sources.push({
            title: hostname,
            url: url,
            snippet: "URL mentioned in the response",
          });
        }
      } catch (e) {
        // Invalid URL, skip
      }
    });

    return sources;
  }
}

export default new LLMGatewayService();
