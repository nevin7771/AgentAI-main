// server/router/agent.js
// Enhanced router to support deep research capabilities based on search_with_ai-main

import express from "express";
import { createAgent } from "../agents/index.js";

const router = express.Router();

// Handler for deep research requests with streaming response
router.post("/api/deep-research", async (req, res) => {
  try {
    const {
      query,
      sources = ["support.zoom.us", "community.zoom.us", "zoom.us"],
      depth = 2,
      breadth = 3,
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query is required",
      });
    }

    console.log(`[DeepResearch] Starting research for: "${query}"`);

    // Setup SSE for streaming updates
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send initial progress update
    res.write(
      `data: ${JSON.stringify({
        type: "progress",
        status: "analyzing",
        message: "Analyzing query and planning research approach...",
      })}\n\n`
    );

    // Create the deep research agent with progress callback
    const deepResearchAgent = createAgent("deep-research", {
      sources,
      depth,
      breadth,
      onProgress: (progress) => {
        // Send progress updates as SSE events
        const status = progress.status || "researching";
        let message = "Researching...";
        
        switch (status) {
          case "analyzing":
            message = "Analyzing query and planning research approach...";
            break;
          case "searching":
            message = `Searching for information on: ${progress.currentQuery?.substring(0, 30)}...`;
            break;
          case "researching":
            message = `Researching at depth ${progress.currentDepth}...`;
            break;
          case "summarizing":
            message = "Synthesizing findings and generating report...";
            break;
          case "done":
            message = "Research complete!";
            break;
        }
        
        res.write(
          `data: ${JSON.stringify({
            type: "progress",
            status,
            message,
            progress,
          })}\n\n`
        );
      },
    });

    // Execute the deep research
    const result = await deepResearchAgent.execute(query);

    // Send the final result
    res.write(
      `data: ${JSON.stringify({
        type: "complete",
        result,
      })}\n\n`
    );

    res.end();
  } catch (error) {
    console.error("[DeepResearch] Error:", error);

    // If headers haven't been sent yet, set them up
    if (!res.headersSent) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
    }

    // Send error message
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        error: error.message || "An unknown error occurred",
      })}\n\n`
    );

    res.end();
  }
});

// Handler for standard deep search (non-streaming version)
router.post("/api/deepsearch", async (req, res) => {
  try {
    const {
      query,
      sources = ["support.zoom.us", "community.zoom.us", "zoom.us"],
      depth = 1, // Simpler search with less depth
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query is required",
        formattedHtml: `<div class="deep-search-results error"><h3>Error</h3><p>Query is required</p></div>`,
      });
    }

    console.log(`[DeepSearch] Processing query: "${query}"`);

    // Execute the search immediately without sending a partial response first
    // This will make the client wait but ensures they get the full result
    const deepSearchAgent = createAgent("deep-research", {
      sources,
      depth, 
      breadth: 2,
    });

    // Execute the search
    const result = await deepSearchAgent.execute(query);

    // Format the HTML response
    const formattedHtml = deepSearchAgent.formatResponse(result);

    // Send the complete response
    res.status(200).json({
      success: true,
      result,
      formattedHtml,
    });
  } catch (error) {
    console.error("[DeepSearch] Error:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "An unknown error occurred",
      formattedHtml: `
        <div class="deep-search-results error">
          <h3>Search Error</h3>
          <p>There was an error processing your request: ${
            error.message || "Unknown error"
          }</p>
        </div>
      `,
    });
  }
});

export default router;
