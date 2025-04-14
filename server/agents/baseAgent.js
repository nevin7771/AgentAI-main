// server/agents/baseAgent.js
// Base class that all agents will extend

import config from "./config.js";

export default class BaseAgent {
  constructor(options = {}) {
    this.options = options;
    this.name = options.name || "Base Agent";
    this.description =
      options.description || "Base agent class that all other agents extend";

    // Merge default config with options
    const agentType = options.agentType || "default";
    this.config = {
      ...config.getAgentConfig(agentType),
      ...options,
    };

    // Setup debug logging
    this.debug = this.config.enableDebugLogging;

    // Initialize timeout
    this.timeout = this.config.defaultTimeout;

    // Track execution time
    this.startTime = null;
    this.endTime = null;
  }

  // Log debug messages if debug is enabled
  log(message, data = null) {
    if (this.debug) {
      const logPrefix = `[${this.name}]`;
      if (data) {
        console.log(logPrefix, message, data);
      } else {
        console.log(logPrefix, message);
      }
    }
  }

  // Initialize the agent - useful for setting up connections, etc.
  async initialize() {
    this.log("Initializing agent");
    // To be implemented by child classes
    return true;
  }

  // The main method to execute the agent
  async execute(input) {
    this.startTime = Date.now();
    this.log("Starting execution with input:", input);

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(input);

      this.endTime = Date.now();
      const executionTime = this.endTime - this.startTime;
      this.log(`Execution completed in ${executionTime}ms`);

      return {
        success: true,
        executionTimeMs: executionTime,
        ...result,
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Execute with a timeout
  async executeWithTimeout(input) {
    return new Promise(async (resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        reject(new Error(`Execution timed out after ${this.timeout}ms`));
      }, this.timeout);

      try {
        // Must be implemented by child class
        throw new Error("Execute method must be implemented by child classes");
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  // Format the response for the client
  formatResponse(data) {
    throw new Error(
      "FormatResponse method must be implemented by child classes"
    );
  }

  // Handle errors
  handleError(error) {
    this.log("Error during execution:", error);

    this.endTime = Date.now();
    const executionTime = this.endTime - this.startTime;

    return {
      success: false,
      error: error.message || "An unknown error occurred",
      executionTimeMs: executionTime,
    };
  }
}
