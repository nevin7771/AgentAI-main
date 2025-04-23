// server/router/agent.js
// Enhanced router to support RAG and vector database search capabilities

import express from "express";
import { createAgent } from "../agents/index.js";
import { authMiddleware } from "../middleware/auth.js";
import { performReActSearch } from "../rag/ragSearchService.js";
import { createPineconeIndex } from "../rag/vector/pineconeClient.js";

const router = express.Router();

// Apply auth middleware to all routes in this router
router.use(authMiddleware);

// Initialize the vector database index
let vectorDbInitialized = false;
const initVectorDb = async () => {
  if (vectorDbInitialized) return;
  
  try {
    await createPineconeIndex('agent-ai-searches');
    vectorDbInitialized = true;
    console.log('Vector database initialized successfully');
  } catch (error) {
    console.error('Error initializing vector database:', error);
    // Continue even if vector DB init fails - we'll fall back to standard search
  }
};

// Initialize vector DB when router is loaded, but don't block if it fails
initVectorDb().catch(err => {
  console.warn("Vector DB initialization failed, will use fallback search methods:", err.message);
});

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

// Handler for RAG search with vector database integration
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

    console.log(`[RAGSearch] Processing query: "${query}"`);

    // Perform RAG search with vector database and ReAct approach
    const { answer, searchResults, usedCache } = await performReActSearch(query, sources);

    // Import the formatSearchResultHTML function
    const { formatSearchResultHTML } = await import("../agents/utils/agentUtils.js");
    
    // Use our formatter function to generate clean HTML
    const formattedHtml = formatSearchResultHTML(
      { answer }, 
      query,
      sources
    );

    // Save to chat history if requested
    let savedChatHistoryId = chatHistoryId;
    
    if (req.user) { // Always try to save if user exists
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
        console.log(`[RAGSearch] Saved search to MongoDB, chat ID: ${chatDoc._id}`);
      } catch (error) {
        console.error("[RAGSearch] Error saving to MongoDB:", error);
        // Continue even if saving fails
      }
    }
    
    // Send the response
    res.status(200).json({
      success: true,
      result: {
        query,
        answer,
        usedCache
      },
      formattedHtml,
      chatHistoryId: savedChatHistoryId,
    });
  } catch (error) {
    console.error("[RAGSearch] Error:", error);
    
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

// Handler for deleting chat history
router.delete("/api/chat-history/:chatHistoryId", async (req, res) => {
  try {
    const { chatHistoryId } = req.params;
    
    if (!chatHistoryId) {
      return res.status(400).json({
        success: false,
        error: "Chat history ID is required"
      });
    }

    console.log(`[DeleteChatHistory] Deleting chat history: ${chatHistoryId}`);

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated"
      });
    }

    // Import models
    const { chat } = await import("../model/chat.js");
    const { chatHistory } = await import("../model/chatHistory.js");
    const { user } = await import("../model/user.js");

    // Find the chat history
    const chatHistoryDoc = await chatHistory.findById(chatHistoryId);
    
    if (!chatHistoryDoc) {
      return res.status(404).json({
        success: false,
        error: "Chat history not found"
      });
    }

    // Verify that the user owns this chat history
    if (chatHistoryDoc.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete this chat history"
      });
    }

    // Find the associated chat
    if (chatHistoryDoc.chat) {
      // Delete the chat
      await chat.findByIdAndDelete(chatHistoryDoc.chat);
      console.log(`Deleted chat: ${chatHistoryDoc.chat}`);
    }

    // Remove the chat history from user's chatHistory array
    const userData = await user.findById(req.user._id);
    if (userData) {
      userData.chatHistory = userData.chatHistory.filter(
        history => history.toString() !== chatHistoryId
      );
      await userData.save();
      console.log(`Removed chat history ${chatHistoryId} from user ${userData._id}`);
    }

    // Delete the chat history
    await chatHistory.findByIdAndDelete(chatHistoryId);
    console.log(`Deleted chat history: ${chatHistoryId}`);

    res.status(200).json({
      success: true,
      message: "Chat history deleted successfully"
    });
  } catch (error) {
    console.error("[DeleteChatHistory] Error:", error);
    
    res.status(500).json({
      success: false,
      error: error.message || "An unknown error occurred"
    });
  }
});

// Handler for standard deep search with RAG integration
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

    // Execute the search
    const deepSearchAgent = createAgent("deep-research", {
      sources,
      depth, 
      breadth: 2,
    });

    // Execute the search
    const result = await deepSearchAgent.execute(query);

    // Save search results to the vector database asynchronously (don't await)
    try {
      const { processResultEmbedding } = await import("../rag/vector/embeddingsService.js");
      const { upsertEmbeddings } = await import("../rag/vector/pineconeClient.js");
      
      // Create embeddings for research sources
      if (result.sources && result.sources.length > 0) {
        const embeddingPromises = result.sources.map(source => 
          processResultEmbedding(source.content || source.snippet || '', {
            title: source.title || 'Deep Search Result',
            url: source.url || source.link || '#',
            source: source.domain || 'Deep Search',
            queryText: query
          })
        );
        
        Promise.all(embeddingPromises)
          .then(embeddings => upsertEmbeddings('agent-ai-searches', embeddings))
          .then(() => console.log('Deep search results saved to vector database'))
          .catch(err => console.error('Error saving to vector database:', err));
      }
    } catch (error) {
      console.error('Error processing vector database:', error);
      // Continue - vector DB operations are optional
    }

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
