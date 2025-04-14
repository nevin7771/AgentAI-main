// server/agents/deepSearchAgent.js
// Implementation of the Deep Search agent using the ReAct approach

import BaseAgent from "./baseAgent.js";
import OpenAI from "openai";

export default class DeepSearchAgent extends BaseAgent {
  constructor(options = {}) {
    super(options);
    this.name = "Deep Search Agent";
    this.description =
      "Searches across multiple sources using the ReAct approach";
    this.sources = options.sources || [
      "support.zoom.us",
      "community.zoom.us",
      "zoom.us",
    ];
    this.maxIterations = options.maxIterations || 5;
    this.openaiApiKey = options.openaiApiKey || process.env.OPENAI_API_KEY;
    this.openai = null;
  }

  async execute(query) {
    try {
      if (!this.openai) {
        await this.initialize();
      }

      console.log(`[${this.name}] Executing search for: "${query}"`);
      console.log(`[${this.name}] Sources: ${this.sources.join(", ")}`);

      // Implement the ReAct approach
      return await this.reactSearch(query);
    } catch (error) {
      return this.handleError(error);
    }
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

  async reactSearch(query) {
    // Initial system prompt for ReAct approach
    const systemPrompt = `You are a Research Agent that follows the ReAct (Reasoning + Acting) approach to find information.
    You have access to search across these sources: ${this.sources.join(", ")}.
    
    IMPORTANT: Follow this format for your reasoning and actions:
    
    Thought: Think step by step about what information you need and how to find it.
    Action: [SEARCH] your search query here
    Observation: (This will be the search results)
    ... (repeat as needed)
    Thought: I now have enough information to answer the original question.
    Answer: Your final answer here, with citations to sources.
    
    Always cite your sources with URLs when possible. Be thorough but concise.`;

    let messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Research query: "${query}"` },
    ];

    let iterations = 0;
    let finalAnswer = null;

    while (iterations < this.maxIterations && !finalAnswer) {
      iterations++;
      console.log(`[${this.name}] Iteration ${iterations}`);

      // Get the next thought/action from the model
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: messages,
        temperature: 0.5,
      });

      const aiMessage = response.choices[0].message.content;
      console.log(
        `[${this.name}] AI Response: ${aiMessage.substring(0, 100)}...`
      );

      // Check if we've reached a final answer
      if (aiMessage.includes("Answer:")) {
        const answerMatch = aiMessage.match(/Answer:(.*?)$/s);
        if (answerMatch && answerMatch[1]) {
          finalAnswer = answerMatch[1].trim();
          break;
        }
      }

      // Handle the ReAct search action
      if (aiMessage.includes("Action: [SEARCH]")) {
        const searchMatch = aiMessage.match(/Action: \[SEARCH\](.*?)(?=\n|$)/);
        if (searchMatch && searchMatch[1]) {
          const searchQuery = searchMatch[1].trim();
          console.log(`[${this.name}] Performing search: ${searchQuery}`);

          // Simulate search results - in a real implementation, you would perform an actual search
          const searchResults = await this.simulateSearch(
            searchQuery,
            this.sources
          );

          messages.push({ role: "assistant", content: aiMessage });
          messages.push({
            role: "user",
            content: `Observation: ${searchResults}`,
          });
        }
      } else {
        // If no action is specified, just continue the conversation
        messages.push({ role: "assistant", content: aiMessage });

        // If no action and no final answer, we need to prompt for more structure
        if (!finalAnswer) {
          messages.push({
            role: "user",
            content:
              "Please continue your research following the ReAct format with Thought, Action, and Observation steps.",
          });
        }
      }
    }

    // If we've hit max iterations without a final answer, generate one
    if (!finalAnswer) {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          ...messages,
          {
            role: "user",
            content:
              "Please provide your final answer based on the research so far.",
          },
        ],
        temperature: 0.5,
      });

      finalAnswer = response.choices[0].message.content;
    }

    return {
      success: true,
      query,
      sources: this.sources,
      iterations,
      answer: finalAnswer,
    };
  }

  // Simulated search function - in a real implementation, replace with actual API calls
  async simulateSearch(query, sources) {
    // Here you would implement actual search functionality
    // For example, using a search API, web scraping, etc.

    // For now, we'll return simulated results
    const simulatedResults = [
      {
        source: sources[0],
        url: `https://${sources[0]}/search?q=${encodeURIComponent(query)}`,
        title: `Search results for "${query}" on ${sources[0]}`,
        snippet: `This is a simulated search result about ${query} from ${sources[0]}. In a real implementation, this would contain actual content from the source.`,
      },
      {
        source: sources[1],
        url: `https://${sources[1]}/search?q=${encodeURIComponent(query)}`,
        title: `Community discussion about "${query}"`,
        snippet: `Users on ${sources[1]} have discussed ${query} in several threads. Common solutions include troubleshooting steps and best practices.`,
      },
    ];

    // Format the results as a string
    return simulatedResults
      .map(
        (result) =>
          `Source: ${result.source}\nURL: ${result.url}\nTitle: ${result.title}\nSnippet: ${result.snippet}`
      )
      .join("\n\n");
  }

  formatResponse(data) {
    // Create a well-formatted HTML response
    if (!data.success) {
      return `<div class="deep-search-results error">
        <h3>Deep Research Error</h3>
        <p>Sorry, there was an error processing your deep search request: ${data.error}</p>
      </div>`;
    }

    // Process the answer to extract and enhance citations
    let answer = data.answer;

    // Extract URLs from the answer for citation section
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = answer.match(urlRegex) || [];
    const uniqueUrls = [...new Set(urls)];

    // Make URLs in the answer clickable
    uniqueUrls.forEach((url) => {
      const displayUrl = url.length > 50 ? url.substring(0, 47) + "..." : url;
      answer = answer.replace(
        new RegExp(url.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "g"),
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${displayUrl}</a>`
      );
    });

    // Highlight key points using regexes
    answer = answer.replace(
      /([^.]*)important([^.]*)\./gi,
      "<strong>$1important$2.</strong>"
    );

    // Format the main response
    let html = `
      <div class="deep-search-results">
        <h3>Deep Research Results</h3>
        <p><strong>Query:</strong> "${data.query}"</p>
        <p><strong>Sources searched:</strong> ${data.sources.join(", ")}</p>
        
        <h4>Research Findings</h4>
        <div class="deep-search-answer">${answer}</div>
    `;

    // Add citations section if URLs were found
    if (uniqueUrls.length > 0) {
      html += `
        <h4>Citations</h4>
        <ol class="deep-search-citations">
      `;

      uniqueUrls.forEach((url) => {
        let domain = "";
        try {
          domain = new URL(url).hostname;
        } catch (e) {
          domain = url;
        }

        html += `
          <li class="citation-item">
            <a href="${url}" target="_blank" rel="noopener noreferrer">
              ${domain}
            </a>
          </li>
        `;
      });

      html += `</ol>`;
    }

    // Add disclaimer
    html += `
      <div class="deep-search-disclaimer">
        <p><small>Note: This research was performed by an AI assistant and may not be comprehensive. Please verify important information.</small></p>
      </div>
    `;

    // Close the main div
    html += `</div>`;

    return html;
  }
}
