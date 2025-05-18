// server/agents/index.js
import DeepResearchAgent from "./deepResearchAgent.js";
import LLMGatewaySearchAgent from "./llmGatewaySearchAgent.js";

// Agent factory - allows for easy addition of new agents
export const createAgent = (type, options = {}) => {
  switch (type) {
    case "deep-research":
      return new DeepResearchAgent(options);
    case "llm-gateway-search": // Add this case for your new agent
      return new LLMGatewaySearchAgent(options);
    // Add more agent types here as needed
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
};

// Export individual agents for direct use
export { DeepResearchAgent, LLMGatewaySearchAgent };
