// server/agents/config.js
// Configuration for the agent system

import "dotenv/config";

export const config = {
  // OpenAI API configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_DEFAULT_MODEL || "gpt-4",
    fallbackModel: "gpt-3.5-turbo",
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS, 10) || 4000,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
  },

  // Deep Search Agent configuration
  deepSearch: {
    maxIterations: parseInt(process.env.DEEP_SEARCH_MAX_ITERATIONS, 10) || 5,
    defaultSources: process.env.DEFAULT_SEARCH_SOURCES
      ? process.env.DEFAULT_SEARCH_SOURCES.split(",")
      : ["support.zoom.us", "community.zoom.us", "zoom.us"],
    searchTimeout: parseInt(process.env.SEARCH_TIMEOUT_MS, 10) || 30000,
    useRealSearchApi: process.env.USE_REAL_SEARCH_API === "true",
    searchApiKey: process.env.SEARCH_API_KEY,
  },

  // QA Agent configuration
  qa: {
    defaultProductName: process.env.DEFAULT_PRODUCT_NAME || "Zoom",
    maxResponseLength: parseInt(process.env.QA_MAX_RESPONSE_LENGTH, 10) || 500,
  },

  // Shared agent configuration
  agent: {
    enableDebugLogging: process.env.AGENT_DEBUG_LOGGING === "true",
    defaultTimeout: parseInt(process.env.AGENT_TIMEOUT_MS, 10) || 60000,
    cacheEnabled: process.env.AGENT_CACHE_ENABLED === "true",
    cacheTTL: parseInt(process.env.AGENT_CACHE_TTL_SECONDS, 10) || 3600,
  },

  // Function to get config for a specific agent
  getAgentConfig(agentType) {
    switch (agentType) {
      case "deep-search":
        return {
          ...this.agent,
          ...this.openai,
          ...this.deepSearch,
        };
      case "qa":
        return {
          ...this.agent,
          ...this.openai,
          ...this.qa,
        };
      default:
        return {
          ...this.agent,
          ...this.openai,
        };
    }
  },
};

export default config;
