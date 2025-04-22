// server/agents/index.js
import DeepSearchAgent from "./deepSearchAgent.js";
import SearchWithAIAgent from "./searchWithAIAgent.js";

// Agent factory - allows for easy addition of new agents
export const createAgent = (type, options = {}) => {
  switch (type) {
    case "deep-search":
      return new DeepSearchAgent(options);
    case "search-with-ai":
      return new SearchWithAIAgent(options);
    // Add more agent types here as needed
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
};

// Export individual agents for direct use
export { DeepSearchAgent, SearchWithAIAgent };
