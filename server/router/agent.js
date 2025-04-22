// server/router/agent.js
// Enhanced router to support deep research capabilities

import express from "express";
import axios from "axios";
import { load } from "cheerio";
import { createAgent } from "../agents/index.js";

const router = express.Router();

// Handler for deep research requests
// Simplified router for deep-research
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

    // Setup SSE
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

    // Create a basic mock response for now
    setTimeout(() => {
      res.write(
        `data: ${JSON.stringify({
          type: "progress",
          status: "searching",
          message: "Searching for relevant information...",
        })}\n\n`
      );

      setTimeout(() => {
        res.write(
          `data: ${JSON.stringify({
            type: "complete",
            result: {
              success: true,
              query,
              report: `# Research Results for: ${query}\n\nZoom meetings can be scheduled through various methods:\n\n1. **Web Portal**: Log in to zoom.us and use the Schedule button\n2. **Desktop App**: Open Zoom client and click Schedule\n3. **Mobile App**: Tap the Schedule button in the Zoom mobile app\n\nWhen scheduling, you can set options such as date/time, meeting ID, password, and participant settings.`,
              visitedUrls: [
                "https://support.zoom.us/hc/en-us/articles/201362413-Scheduling-meetings",
                "https://zoom.us/meetings",
              ],
              enhancedQueries: [
                "How to schedule recurring Zoom meetings",
                "Zoom meeting scheduling options and settings",
                "Scheduling Zoom meetings via calendar integrations",
              ],
              executionTimeMs: 3500,
            },
          })}\n\n`
        );

        res.end();
      }, 2000);
    }, 2000);
  } catch (error) {
    console.error("[DeepResearch] Error:", error);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

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
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query is required",
        formattedHtml: `<div class="deep-search-results error"><h3>Error</h3><p>Query is required</p></div>`,
      });
    }

    console.log(`[DeepSearch] Processing query: "${query}"`);

    // Create the deep search agent with simpler configuration
    const deepSearchAgent = createAgent("deep-search", {
      sources,
      depth: 1, // Basic depth for regular search
      breadth: 2, // Limited breadth for regular search
    });

    // Execute the search
    const result = await deepSearchAgent.execute(query);

    // Format the HTML response
    const formattedHtml = deepSearchAgent.formatResponse(result);

    // Send the response
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
