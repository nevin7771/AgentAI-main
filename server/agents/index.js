// server/agents/index.js
// This file serves as the entry point for all agent-related functionality

import DeepSearchAgent from "./deepSearchAgent.js";

// Agent factory - allows for easy addition of new agents
export const createAgent = (type, options = {}) => {
  switch (type) {
    case "deep-search":
      return new DeepSearchAgent(options);

    // Add more agent types here as needed
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
};

// Export individual agents for direct use
export { DeepSearchAgent };
