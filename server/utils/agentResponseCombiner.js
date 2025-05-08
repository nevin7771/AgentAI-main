// server/utils/agentResponseCombiner.js

/**
 * Combines responses from multiple agents into a single coherent response
 * @param {Object} agentResults - Key-value pairs of agent IDs and their responses
 * @param {Array} agents - Array of agent objects with id and name properties
 * @param {string} question - The original question asked
 * @returns {Object} Combined result with HTML formatting
 */
export const combineAgentResponses = (agentResults, agents, question) => {
  // Get agent names mapping
  const agentNames = {};
  agents.forEach((agent) => {
    agentNames[agent.id] = agent.name;
  });

  // Simple case: only one agent response
  if (Object.keys(agentResults).length === 1) {
    const agentId = Object.keys(agentResults)[0];
    const agentName = agentNames[agentId] || agentId;
    return {
      combinedResult: {
        [agentId]: agentResults[agentId],
      },
      formattedHtml: formatSingleAgentResponse(
        question,
        agentName,
        agentResults[agentId]
      ),
    };
  }

  // Multiple agent case: combine results
  const combinedResult = {};

  // Add each agent's result to the combined result
  for (const agentId in agentResults) {
    combinedResult[agentId] = agentResults[agentId];
  }

  // Format the HTML response for multiple agents
  const formattedHtml = formatMultiAgentResponse(
    question,
    agentResults,
    agentNames
  );

  return { combinedResult, formattedHtml };
};

/**
 * Format a response from an agent
 * @param {Object} agentResponse - The agent's response object
 * @param {string} agentDisplayName - Name of the agent to display
 * @returns {string} Formatted HTML response
 */
export const formatAgentResponse = (agentResponse, agentDisplayName) => {
  // If response is already HTML, return it directly
  if (typeof agentResponse === "string") {
    return agentResponse;
  }

  // If it's a report from deepResearchAgent
  if (agentResponse.report) {
    return `
      <div class="deep-research-results">
        <div class="agent-answer-container">
          ${agentResponse.report}
        </div>
        
        <div class="search-metadata" style="display:none">
          <div class="search-query">${agentResponse.query || "Unknown query"}</div>
          <div class="search-agent">${agentDisplayName}</div>
        </div>
      </div>
    `;
  }

  // Generic agent response format - simplified to avoid markdown parsing issues
  return `
    <div class="simple-search-results">
      <div class="agent-answer-container">
        ${
          agentResponse.answer ||
          agentResponse.text ||
          "No response content available"
        }
      </div>
      
      <div class="search-metadata" style="display:none">
        <div class="search-query">${agentResponse.query || "Unknown query"}</div>
        <div class="search-agent">${agentDisplayName}</div>
      </div>
    </div>
  `;
};

/**
 * Format a single agent response
 * @param {string} question - Original question
 * @param {string} agentName - Name of the agent
 * @param {string} response - The agent's response
 */
const formatSingleAgentResponse = (question, agentName, response) => {
  return `
    <div class="simple-search-results">
      <div class="agent-answer-container">
        ${response}
      </div>
      
      <div class="search-metadata" style="display:none">
        <div class="search-query">${question}</div>
        <div class="search-agent">${agentName}</div>
      </div>
    </div>
  `;
};

/**
 * Format multiple agent responses
 * @param {string} question - Original question
 * @param {Object} agentResponses - Responses from multiple agents
 * @param {Object} agentNames - Mapping of agent IDs to human-readable names
 */
const formatMultiAgentResponse = (question, agentResponses, agentNames) => {
  // Create a simplified structure to avoid markdown issues on refresh
  let html = `
    <div class="multi-agent-results">
      <div class="agent-answer-container">
  `;

  // Add each agent's response
  for (const agentId in agentResponses) {
    const displayName = agentNames[agentId] || agentId;
    html += `
      <div class="agent-result">
        <h4>${displayName}</h4>
        <div class="agent-answer">
          ${agentResponses[agentId]}
        </div>
      </div>
    `;
  }

  // Close content div and add metadata
  html += `
      </div>
      
      <div class="search-metadata" style="display:none">
        <div class="search-query">${question}</div>
        <div class="search-agents">${Object.values(agentNames).join(', ')}</div>
      </div>
    </div>
  `;

  return html;
};

export default combineAgentResponses;
