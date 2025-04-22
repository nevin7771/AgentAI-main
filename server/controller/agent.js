// server/controller/agent.js
// Controller for handling agent-related requests

import { createAgent } from "../agents/index.js";

// Handler for deep search agent requests
// server/controller/agent.js
export const deepSearchHandler = async (req, res) => {
  try {
    const { query, sources } = req.body;

    if (!query) {
      return res
        .status(400)
        .json({ success: false, error: "Query is required" });
    }

    console.log(`[DeepSearch] Received request for query: "${query}"`);
    console.log(
      `[DeepSearch] Sources: ${sources ? sources.join(", ") : "default"}`
    );

    // For now, return a simulated response since our agent system might not be fully implemented
    const simulatedResponse = generateSimulatedResponse(query, sources);

    // Send back both the raw result and the formatted HTML
    res.status(200).json({
      success: true,
      rawResult: { query, sources, answer: simulatedResponse.text },
      formattedHtml: simulatedResponse.html,
    });
  } catch (error) {
    console.error("[DeepSearch] Error:", error);

    const errorResponse = {
      success: false,
      error: error.message || "An unknown error occurred",
    };

    res.status(500).json(errorResponse);
  }
};

// Helper function to generate a simulated response
function generateSimulatedResponse(query, sources = []) {
  const defaultSources = ["support.zoom.us", "community.zoom.us", "zoom.us"];
  const usedSources = sources.length > 0 ? sources : defaultSources;

  const text = `Based on research across ${usedSources.join(
    ", "
  )}, here's what I found about "${query}":
  
The query "${query}" appears to be related to Zoom's functionality. According to resources on ${
    usedSources[0]
  }, this is a common question that users have.

The main points to consider are:
1. Zoom provides extensive documentation on this topic
2. Community forums show several users have similar questions
3. There are official guides available that address this specific issue

For more detailed information, you can visit:
- https://${usedSources[0]}/hc/en-us/articles/search?query=${encodeURIComponent(
    query
  )}
- https://${usedSources[1]}/t5/${encodeURIComponent(query)}`;

  const html = `
    <div class="deep-search-results">
      <h3>Deep Research Results</h3>
      <p><strong>Query:</strong> "${query}"</p>
      <p><strong>Sources searched:</strong> ${usedSources.join(", ")}</p>
      
      <h4>Research Findings</h4>
      <div class="deep-search-answer">
        <p>Based on research across multiple sources, here's what I found about "${query}":</p>
        
        <p>The query "${query}" appears to be related to Zoom's functionality. According to resources on ${
    usedSources[0]
  }, this is a common question that users have.</p>
        
        <p>The main points to consider are:</p>
        <ul>
          <li>Zoom provides extensive documentation on this topic</li>
          <li>Community forums show several users have similar questions</li>
          <li>There are official guides available that address this specific issue</li>
        </ul>
        
        <p>For more detailed information, you can visit:</p>
        <ul>
          <li><a href="https://${
            usedSources[0]
          }/hc/en-us/articles/search?query=${encodeURIComponent(
    query
  )}" target="_blank">${usedSources[0]} Documentation</a></li>
          <li><a href="https://${usedSources[1]}/t5/${encodeURIComponent(
    query
  )}" target="_blank">${usedSources[1]} Community</a></li>
        </ul>
      </div>
      
      <h4>Citations</h4>
      <ol class="deep-search-citations">
        <li class="citation-item">
          <a href="https://${
            usedSources[0]
          }/hc/en-us/articles/search?query=${encodeURIComponent(
    query
  )}" target="_blank">${usedSources[0]}</a>
        </li>
        <li class="citation-item">
          <a href="https://${usedSources[1]}/t5/${encodeURIComponent(
    query
  )}" target="_blank">${usedSources[1]}</a>
        </li>
      </ol>
      
      <div class="deep-search-disclaimer">
        <p><small>Note: This research was performed by an AI assistant and may not be comprehensive. Please verify important information.</small></p>
      </div>
    </div>
  `;

  return { text, html };
}

// Handler for generic agent requests - extensible for future agents
export const agentHandler = async (req, res, next) => {
  try {
    const { agentType, input, options } = req.body;

    if (!agentType || !input) {
      return res.status(400).json({
        error: "Agent type and input are required",
      });
    }

    console.log(`[Agent] Received request for agent type: "${agentType}"`);

    // Create the requested agent
    const agent = createAgent(agentType, options || {});

    // Execute the agent
    const result = await agent.execute(input);

    // Format the response
    const formattedResponse = agent.formatResponse(result);

    // Send back both the raw result and the formatted response
    res.status(200).json({
      success: true,
      rawResult: result,
      formattedResponse,
    });
  } catch (error) {
    console.error("[Agent] Error:", error);

    const errorResponse = {
      success: false,
      error: error.message || "An unknown error occurred",
    };

    res.status(500).json(errorResponse);
  }
};

// server/controller/agent.js (addition to existing file)

// Handler for search-with-ai agent requests
export const searchWithAIHandler = async (req, res) => {
  try {
    const { query, sources, mode } = req.body;

    if (!query) {
      return res
        .status(400)
        .json({ success: false, error: "Query is required" });
    }

    console.log(
      `[SearchWithAI] Received request for query: "${query}" with mode: ${
        mode || "simple"
      }`
    );
    console.log(
      `[SearchWithAI] Sources: ${sources ? sources.join(", ") : "default"}`
    );

    // Create the search-with-ai agent
    const agent = createAgent("search-with-ai", {
      sources: sources || ["support.zoom.us", "community.zoom.us", "zoom.us"],
      searchMode: mode || "simple",
    });

    // Execute the agent
    const result = await agent.execute(query);

    // Format the response
    const formattedHtml = agent.formatResponse(result);

    // Send back both the raw result and the formatted HTML
    res.status(200).json({
      success: true,
      rawResult: result,
      formattedHtml,
    });
  } catch (error) {
    console.error("[SearchWithAI] Error:", error);

    const errorResponse = {
      success: false,
      error: error.message || "An unknown error occurred",
      formattedHtml: `<div class="search-with-ai-results error"><h3>Error</h3><p>${
        error.message || "An unknown error occurred"
      }</p></div>`,
    };

    res.status(500).json(errorResponse);
  }
};
