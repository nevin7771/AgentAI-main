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

// Handler for simple search - faster with fewer tokens
router.post("/api/simplesearch", async (req, res) => {
  try {
    const {
      query,
      sources = ["support.zoom.us", "community.zoom.us", "zoom.us"],
    } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: "Query is required",
        formattedHtml: `<div class="simple-search-results error"><h3>Error</h3><p>Query is required</p></div>`,
      });
    }

    console.log(`[SimpleSearch] Processing query: "${query}"`);

    // Create a simple search response using OpenAI directly
    // This is much faster as it doesn't involve the deep research process
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      throw new Error("OpenAI API key is required for simple search");
    }

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Create a prompt that will generate a concise answer
    const prompt = `
      Please provide a brief, accurate answer about: "${query}"
      
      Your answer should:
      1. Be concise and direct (under 500 words total)
      2. Include only verified, factual information
      3. Include 3-5 key points about the topic
      4. Not exceed 500 words
      5. Focus only on answering the specific question
      6. Include a brief definition or explanation if it's a technical term
      
      Format the answer in markdown with:
      - A brief title
      - A 1-2 sentence introduction/definition
      - 3-5 bullet points with key information
      - A very brief conclusion

      If it's a technical term specifically related to Zoom, explain what it is.
    `;

    // Get a response from OpenAI
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 700, // Limit to about 500 words
    });

    const answer = chatCompletion.choices[0].message.content;

    // Format to HTML
    const markdownToHtml = (markdown) => {
      if (!markdown) return "";
      
      return markdown
        // Headers
        .replace(/^# (.*)$/gm, '<h1>$1</h1>')
        .replace(/^## (.*)$/gm, '<h2>$1</h2>')
        .replace(/^### (.*)$/gm, '<h3>$1</h3>')
        
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        
        // Lists
        .replace(/^- (.*)$/gm, '<li>$1</li>')
        .replace(/^\* (.*)$/gm, '<li>$1</li>')
        .replace(/^(\d+)\. (.*)$/gm, '<li>$2</li>')
        
        // Paragraphs
        .replace(/^(?!<[a-z]+>)(.+)$/gm, '<p>$1</p>');
    };

    const formattedHtml = `
      <div class="simple-search-results">
        <style>
          .simple-search-results {
            font-family: 'Google Sans', Arial, sans-serif;
            max-width: 100%;
            margin: 0;
            padding: 16px;
            color: #202124;
          }
          .simple-search-results h1 {
            font-size: 20px;
            margin: 0 0 16px 0;
            color: #202124;
            font-weight: 500;
          }
          .simple-search-results h2 {
            font-size: 18px;
            margin: 16px 0 8px 0;
            color: #202124;
            font-weight: 500;
          }
          .simple-search-results p {
            font-size: 16px;
            line-height: 1.5;
            margin: 0 0 16px 0;
          }
          .simple-search-results ul {
            margin: 0 0 16px 0;
            padding: 0 0 0 20px;
          }
          .simple-search-results li {
            margin-bottom: 8px;
            line-height: 1.5;
          }
          .simple-search-note {
            font-size: 12px;
            color: #5f6368;
            margin-top: 16px;
            border-top: 1px solid #dadce0;
            padding-top: 16px;
          }
        </style>

        <h3>Search Results</h3>
        <p><strong>Query:</strong> "${query}"</p>
        
        <div class="simple-search-content">
          ${markdownToHtml(answer)}
        </div>
        
        <div class="simple-search-note">
          <p><small>Note: This is a simple search result. For more comprehensive research, use the Deep Research option.</small></p>
        </div>
      </div>
    `;

    // Send the response
    res.status(200).json({
      success: true,
      result: {
        query,
        answer
      },
      formattedHtml,
    });
  } catch (error) {
    console.error("[SimpleSearch] Error:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "An unknown error occurred",
      formattedHtml: `
        <div class="simple-search-results error">
          <h3>Search Error</h3>
          <p>There was an error processing your request: ${
            error.message || "Unknown error"
          }</p>
        </div>
      `,
    });
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
