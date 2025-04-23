// server/router/agent.js
// Enhanced router to support deep research capabilities based on search_with_ai-main

import express from "express";
import { createAgent } from "../agents/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Apply auth middleware to all routes in this router
router.use(authMiddleware);

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
      saveToHistory = false,
      chatHistoryId = "",
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

    // Create a prompt that will generate a very concise answer with related questions
    const prompt = `
      Please provide a brief, direct answer about: "${query}"
      
      STRICT REQUIREMENTS:
      1. ABSOLUTE MAXIMUM 300 words total for everything (title, intro, bullets, related questions, etc.)
      2. Be extremely concise and direct
      3. Include only the most essential information
      4. Use short, clear sentences
      5. Focus exclusively on answering the specific question
      
      Format:
      - Short H1 title (# Title) - Keep it brief
      - 1-2 sentence introduction - Be direct and concise
      - 3-4 bullet points with key information - Short and focused
      - No conclusion
      
      THEN, add 3 related follow-up questions formatted as:
      
      ## Related Questions
      - [first related question]
      - [second related question] 
      - [third related question]
      
      The total output including the related questions MUST be under 300 words. Prioritize quality of main answer over length of related questions if needed.
    `;

    // Get a response from OpenAI
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 300, // Hard limit to 300 words
    });

    const answer = chatCompletion.choices[0].message.content;

    // Import the formatSearchResultHTML function
    const { formatSearchResultHTML } = await import("../agents/utils/agentUtils.js");
    
    // Use our new formatter function to generate clean HTML without embedded CSS
    const formattedHtml = formatSearchResultHTML(
      { answer }, // Pass an object with the answer property
      query,      // The original query
      sources     // The sources array
    );

    // Save to chat history if requested
    let savedChatHistoryId = chatHistoryId;
    
    if (req.user) { // Always try to save if user exists, login or IP-based
      try {
        const { chat } = await import("../model/chat.js");
        const { chatHistory } = await import("../model/chatHistory.js");
        
        // Create or get chat history
        let chatHistoryDoc;
        
        if (chatHistoryId && chatHistoryId.length > 2) {
          // Use existing chat history
          chatHistoryDoc = await chatHistory.findById(chatHistoryId);
          if (!chatHistoryDoc) {
            // If not found, create new
            chatHistoryDoc = new chatHistory({
              user: req.user._id,
              title: query.substring(0, 30),
            });
            await chatHistoryDoc.save();
          }
        } else {
          // Create new chat history
          chatHistoryDoc = new chatHistory({
            user: req.user._id,
            title: query.substring(0, 30),
          });
          await chatHistoryDoc.save();
        }
        
        savedChatHistoryId = chatHistoryDoc._id;
        
        // Create chat entry
        const chatDoc = new chat({
          chatHistory: chatHistoryDoc._id,
          messages: [
            {
              sender: req.user._id,
              message: {
                user: query,
                gemini: formattedHtml,
              },
              isSearch: true,
              searchType: "simple",
            },
          ],
        });
        
        await chatDoc.save();
        
        // Update the chatHistory document with the new chat reference
        chatHistoryDoc.chat = chatDoc._id;
        await chatHistoryDoc.save();
        
        // Update the user document to include this chat history if it's new
        if (!chatHistoryId || chatHistoryId.length < 2) {
          const { user } = await import("../model/user.js");
          const userData = await user.findById(req.user._id);
          if (userData) {
            // Check if the chat history ID already exists in the user's chatHistory array
            const historyExists = userData.chatHistory.some(
              history => history.toString() === chatHistoryDoc._id.toString()
            );
            
            // If it doesn't exist, add it
            if (!historyExists) {
              userData.chatHistory.push(chatHistoryDoc._id);
              await userData.save();
              console.log(`Added chat history ${chatHistoryDoc._id} to user ${userData._id}`);
            }
          }
        }
        console.log(`[SimpleSearch] Saved search to MongoDB, chat ID: ${chatDoc._id}`);
      } catch (error) {
        console.error("[SimpleSearch] Error saving to MongoDB:", error);
        // Continue even if saving fails
      }
    }
    
    // Send the response
    res.status(200).json({
      success: true,
      result: {
        query,
        answer
      },
      formattedHtml,
      chatHistoryId: savedChatHistoryId,
    });
  } catch (error) {
    console.error("[SimpleSearch] Error:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "An unknown error occurred",
      formattedHtml: `
        <div class="search-results-container">
          <div class="search-content-wrapper">
            <div class="search-main-content">
              <h2>Search Error</h2>
              <p>There was an error processing your request: ${
                error.message || "Unknown error"
              }</p>
              <p>Please try again or refine your search query.</p>
            </div>
          </div>
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
      saveToHistory = false,
      chatHistoryId = "",
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

    // Save to chat history if requested
    let savedChatHistoryId = chatHistoryId;
    
    if (req.user) { // Always try to save if user exists, login or IP-based
      try {
        const { chat } = await import("../model/chat.js");
        const { chatHistory } = await import("../model/chatHistory.js");
        
        // Create or get chat history
        let chatHistoryDoc;
        
        if (chatHistoryId && chatHistoryId.length > 2) {
          // Use existing chat history
          chatHistoryDoc = await chatHistory.findById(chatHistoryId);
          if (!chatHistoryDoc) {
            // If not found, create new
            chatHistoryDoc = new chatHistory({
              user: req.user._id,
              title: query.substring(0, 30),
            });
            await chatHistoryDoc.save();
          }
        } else {
          // Create new chat history
          chatHistoryDoc = new chatHistory({
            user: req.user._id,
            title: query.substring(0, 30),
          });
          await chatHistoryDoc.save();
        }
        
        savedChatHistoryId = chatHistoryDoc._id;
        
        // Create chat entry
        const chatDoc = new chat({
          chatHistory: chatHistoryDoc._id,
          messages: [
            {
              sender: req.user._id,
              message: {
                user: query,
                gemini: formattedHtml,
              },
              isSearch: true,
              searchType: "deep",
            },
          ],
        });
        
        await chatDoc.save();
        
        // Update the chatHistory document with the new chat reference
        chatHistoryDoc.chat = chatDoc._id;
        await chatHistoryDoc.save();
        
        // Update the user document to include this chat history if it's new
        if (!chatHistoryId || chatHistoryId.length < 2) {
          const { user } = await import("../model/user.js");
          const userData = await user.findById(req.user._id);
          if (userData) {
            // Check if the chat history ID already exists in the user's chatHistory array
            const historyExists = userData.chatHistory.some(
              history => history.toString() === chatHistoryDoc._id.toString()
            );
            
            // If it doesn't exist, add it
            if (!historyExists) {
              userData.chatHistory.push(chatHistoryDoc._id);
              await userData.save();
              console.log(`Added chat history ${chatHistoryDoc._id} to user ${userData._id}`);
            }
          }
        }
        console.log(`[DeepSearch] Saved search to MongoDB, chat ID: ${chatDoc._id}`);
      } catch (error) {
        console.error("[DeepSearch] Error saving to MongoDB:", error);
        // Continue even if saving fails
      }
    }
    
    // Send the complete response
    res.status(200).json({
      success: true,
      result,
      formattedHtml,
      chatHistoryId: savedChatHistoryId,
    });
  } catch (error) {
    console.error("[DeepSearch] Error:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "An unknown error occurred",
      formattedHtml: `
        <div class="search-results-container">
          <div class="search-content-wrapper">
            <div class="search-main-content">
              <h2>Deep Search Error</h2>
              <p>There was an error processing your deep search request: ${
                error.message || "Unknown error"
              }</p>
              <p>Please try again or try using Simple Search instead.</p>
            </div>
          </div>
        </div>
      `,
    });
  }
});

export default router;
