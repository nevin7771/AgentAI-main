// public/src/store/chat-action.js
// Combined and reviewed version based on user feedback and previous iterations.
import { chatAction } from "./chat";
import { userAction } from "./user";

const SERVER_ENDPOINT =
  process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
const USE_PROXY = process.env.REACT_APP_USE_PROXY !== "false";
const BASE_URL = USE_PROXY ? "" : SERVER_ENDPOINT;

const extractKeywords = (queryStr) => {
  if (!queryStr || typeof queryStr !== "string") return [];
  return queryStr
    .toLowerCase()
    .split(" ")
    .filter((kw) => kw.trim().length > 1);
};

// Helper to parse HTML and extract structured data (enhanced for robustness)
const parseFormattedHTML = (htmlString, queryKeywords) => {
  let mainAnswer = htmlString;
  const sources = [];
  const relatedQuestions = [];
  let parsingFailed = false;

  if (typeof DOMParser === "undefined") {
    // Fallback for environments without DOMParser (e.g., some test runners)
    return { mainAnswer, sources, relatedQuestions, parsingFailed: true };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");

    // Attempt to extract main answer (content outside sources/RQs)
    const answerContainer =
      doc.querySelector(".gemini-answer-container") || doc.body; // A more specific container if available
    if (answerContainer) {
      const answerClone = answerContainer.cloneNode(true);
      answerClone
        .querySelectorAll(
          ".sources-section, .related-questions-section, .gemini-sources-grid, .gemini-chips-list, .source-card, .gemini-chip"
        )
        .forEach((el) => el.remove());
      mainAnswer = answerClone.innerHTML || htmlString;
    } else {
      mainAnswer = htmlString; // Fallback to full HTML if no specific container
    }

    // Extract sources
    doc
      .querySelectorAll(".source-card a, .sources-section .search_source a")
      .forEach((el) => {
        const title = el
          .querySelector(".source-card-title, .title")
          ?.textContent.trim();
        const url = el.href;
        const snippet = el
          .querySelector(".source-card-snippet, .snippet")
          ?.textContent.trim();
        const favicon = el.querySelector(".source-favicon, img")?.src;
        if (title && url) {
          sources.push({ title, url, snippet, favicon });
        }
      });

    // Extract related questions
    doc
      .querySelectorAll(".gemini-chip, .related-questions-section .chip")
      .forEach((el) => {
        const questionText = el.textContent.trim();
        if (questionText) {
          relatedQuestions.push(questionText);
        }
      });
  } catch (e) {
    console.error("Error parsing HTML for structured data:", e);
    parsingFailed = true; // Mark as failed, so ScrollChat can treat as preformatted HTML
    // Return original HTML as mainAnswer, and empty sources/RQs
    return {
      mainAnswer: htmlString,
      sources: [],
      relatedQuestions: [],
      parsingFailed,
    };
  }

  return { mainAnswer, sources, relatedQuestions, parsingFailed };
};

export const getRecentChat = () => {
  return (dispatch) => {
    dispatch({ type: "GET_RECENT_CHAT_REQUEST" });
    const url = `${BASE_URL}/gemini/api/getchathistory`;
    fetch(url, { method: "GET", credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          const error = new Error(
            `Server error: ${response.status} ${response.statusText}`
          );
          error.status = response.status;
          throw error;
        }
        return response.json();
      })
      .then((data) => {
        dispatch({ type: "GET_RECENT_CHAT_SUCCESS" });
        const formattedRecentChats = (data.chatHistory || []).map((chat) => ({
          ...chat,
          // Ensure essential fields for sidebar display are present
          _id: chat._id || chat.id,
          title: chat.title || "Untitled Chat",
          searchType: chat.searchType || (chat.isSearch ? "search" : "chat"),
          timestamp: chat.timestamp || new Date().toISOString(),
        }));
        dispatch(
          chatAction.recentChatHandler({ recentChat: formattedRecentChats })
        );
        dispatch(userAction.setLocation({ location: data.location }));
      })
      .catch((err) => {
        dispatch({
          type: "GET_RECENT_CHAT_FAILURE",
          error: {
            message: err.message,
            name: err.name,
            status: err.status || 500,
          },
        });
        console.error("Error in getRecentChat:", err);
      });
  };
};

export const sendChatData = (useInput) => {
  return (dispatch) => {
    const queryKeywords = extractKeywords(useInput.user);
    dispatch(
      chatAction.chatStart({
        useInput: {
          ...useInput,
          queryKeywords,
          sources: [],
          relatedQuestions: [],
          isPreformattedHTML: false, // Standard Gemini API response is not preformatted HTML
          isLoader: "yes", // Show loader immediately
        },
      })
    );
    const apiKey = process.env.REACT_APP_GEMINI_KEY;
    const url = `${BASE_URL}/gemini/api/chat`;

    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      body: JSON.stringify({
        userInput: useInput.user,
        previousChat: useInput.previousChat,
        chatHistoryId: useInput.chatHistoryId,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          const statusCode = response.status;
          const error = new Error(`Server Error: ${statusCode}`);
          error.statusCode = statusCode;
          throw error;
        }
        return response.json();
      })
      .then((data) => {
        dispatch(
          chatAction.previousChatHandler({
            previousChat: [
              { role: "user", parts: data.user },
              { role: "model", parts: data.gemini },
            ],
          })
        );
        dispatch(chatAction.popChat()); // Remove loader
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: data.user,
              gemini: data.gemini,
              isLoader: "no",
              queryKeywords: queryKeywords, // Pass keywords for the response
              sources: [],
              relatedQuestions: [],
              isPreformattedHTML: false, // Standard chat is plain text/markdown
            },
          })
        );
        if (!useInput.chatHistoryId || useInput.chatHistoryId.length < 2) {
          setTimeout(() => {
            dispatch(getRecentChat());
          }, 800);
        }
        dispatch(chatAction.newChatHandler());
        dispatch(
          chatAction.chatHistoryIdHandler({ chatHistoryId: data.chatHistoryId })
        );
      })
      .catch((err) => {
        const statusCode = err.statusCode || 500;
        dispatch(chatAction.popChat()); // Remove loader
        const errorMessage =
          statusCode === 429
            ? "Rate Limit Exceeded. Please wait before trying again."
            : "Oops! Something went wrong. Please refresh and try again.";
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: useInput.user,
              gemini: `<p>${errorMessage}</p>`,
              isLoader: "no",
              queryKeywords: queryKeywords,
              sources: [],
              relatedQuestions: [],
              error: true,
              isPreformattedHTML: true, // Error message is HTML
            },
          })
        );
        dispatch(chatAction.newChatHandler());
      });
  };
};

export const sendDeepSearchRequest = (searchRequest) => {
  return async (dispatch, getState) => {
    const queryKeywords = extractKeywords(searchRequest.query);
    let currentChatHistoryId =
      searchRequest.chatHistoryId || getState().chat.chatHistoryId;
    const searchType = searchRequest.endpoint.includes("simplesearch")
      ? "simple"
      : "deep";

    dispatch(
      chatAction.chatStart({
        useInput: {
          user: searchRequest.query,
          gemini: "", // Placeholder for loader
          isLoader: "yes",
          isSearch: true,
          searchType: searchType,
          queryKeywords: queryKeywords,
          sources: [],
          relatedQuestions: [],
          isPreformattedHTML: false,
        },
      })
    );

    try {
      let url = `${BASE_URL}${searchRequest.endpoint || "/api/deepsearch"}`;
      if (USE_PROXY && !searchRequest.endpoint.startsWith("http")) {
        url = `${searchRequest.endpoint || "/api/deepsearch"}`;
        if (!url.startsWith("/")) url = "/" + url;
      }

      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          query: searchRequest.query,
          sources: searchRequest.sources || [
            "support.zoom.us",
            "community.zoom.us",
            "zoom.us",
          ],
          chatHistoryId: currentChatHistoryId,
        }),
      });

      if (!response.ok) {
        const statusCode = response.status;
        const errorText = await response.text();
        throw new Error(`Server Error: ${statusCode} - ${errorText}`);
      }

      const data = await response.json();
      dispatch(chatAction.popChat()); // Remove loader

      let geminiContent = "Search processed.";
      let sources = [];
      let relatedQuestions = [];
      let isPreformattedHTML = false; // Default to false, let ScrollChat handle markdown

      if (data.success) {
        if (data.result && typeof data.result.answer !== "undefined") {
          // Prefer structured data
          geminiContent = data.result.answer;
          sources = data.result.sources || [];
          relatedQuestions = data.result.relatedQuestions || [];
          isPreformattedHTML = false; // ScrollChat will process this for highlighting etc.
        } else if (data.formattedHtml) {
          // Fallback to HTML blob from agentUtils.formatSearchResultHTML
          const parsed = parseFormattedHTML(data.formattedHtml, queryKeywords);
          geminiContent = parsed.mainAnswer;
          sources = parsed.sources;
          relatedQuestions = parsed.relatedQuestions;
          // If parsing fails, it means the HTML is complex, so let ScrollChat render as is.
          // If parsing succeeds, ScrollChat can still process the mainAnswer for markdown & highlighting.
          isPreformattedHTML = parsed.parsingFailed;
        } else {
          geminiContent = "No answer content found.";
          isPreformattedHTML = false;
        }
      } else {
        geminiContent = `<p>Search failed: ${
          data.error || "Unknown error"
        }</p>`;
        isPreformattedHTML = true; // Error messages are HTML
      }

      dispatch(
        chatAction.chatStart({
          useInput: {
            user: searchRequest.query,
            gemini: geminiContent,
            isLoader: "no",
            isSearch: true,
            searchType,
            usedCache: data.result?.usedCache,
            queryKeywords: queryKeywords,
            sources: sources,
            relatedQuestions: relatedQuestions,
            isPreformattedHTML: isPreformattedHTML,
          },
        })
      );

      let finalChatHistoryId = data.chatHistoryId;
      if (!finalChatHistoryId && data.success) {
        // If backend didn't return an ID but search was successful
        try {
          const createHistoryUrl = `${BASE_URL}/api/create-chat-history`;
          const historyResponse = await fetch(createHistoryUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              title:
                searchRequest.query.substring(0, 50) || `${searchType} Search`,
              message: {
                user: searchRequest.query,
                gemini: geminiContent,
                sources,
                relatedQuestions,
                queryKeywords,
                isPreformattedHTML,
              },
              isSearch: true,
              searchType: searchType,
            }),
          });
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            if (historyData.success && historyData.chatHistoryId) {
              finalChatHistoryId = historyData.chatHistoryId;
            }
          }
        } catch (historyError) {
          console.error(
            "Error creating chat history for search:",
            historyError
          );
        }
      }

      if (finalChatHistoryId) {
        dispatch(
          chatAction.chatHistoryIdHandler({ chatHistoryId: finalChatHistoryId })
        );
        // Save to localStorage
        try {
          const existingStorageHistory = JSON.parse(
            localStorage.getItem("searchHistory") || "[]"
          );
          const historyItem = {
            id: finalChatHistoryId,
            title: searchRequest.query.substring(0, 50),
            timestamp: new Date().toISOString(),
            type: searchType,
          };
          if (
            !existingStorageHistory.some(
              (item) => item.id === finalChatHistoryId
            )
          ) {
            existingStorageHistory.unshift(historyItem);
            localStorage.setItem(
              "searchHistory",
              JSON.stringify(existingStorageHistory.slice(0, 50))
            );
            window.dispatchEvent(new Event("storage")); // Notify sidebar
          }
        } catch (err) {
          console.error("Error saving search history to localStorage:", err);
        }
      }
      dispatch(chatAction.newChatHandler()); // Reset for new input
    } catch (error) {
      console.error(`Error in sendDeepSearchRequest (${searchType}):`, error);
      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: searchRequest.query,
            gemini: `<p>Search Error: ${error.message}</p>`,
            isLoader: "no",
            isSearch: true,
            searchType,
            error: true,
            queryKeywords: queryKeywords,
            sources: [],
            relatedQuestions: [],
            isPreformattedHTML: true,
          },
        })
      );
      dispatch(chatAction.newChatHandler());
    }
  };
};

export const getChat = (chatId) => {
  return (dispatch) => {
    dispatch({ type: "GET_CHAT_REQUEST" });
    const url = `${BASE_URL}/api/chatdata`;
    fetch(url, { 
      method: "POST", 
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatHistoryId: chatId }) 
    })
      .then(async (response) => {
        if (!response.ok) {
          let errorMessage = `Server error: ${response.status} ${response.statusText}`;
          if (response.status === 404) {
            errorMessage = `Chat history not found (404): The requested chat with ID ${chatId} could not be found. It may have been deleted or the ID is incorrect.`;
          } else {
            try {
              const errorBody = await response.text();
              errorMessage += `. Details: ${errorBody}`;
            } catch (e) {
              /* ignore */
            }
          }
          const error = new Error(errorMessage);
          error.status = response.status;
          throw error;
        }
        return response.json();
      })
      .then((data) => {
        dispatch({ type: "GET_CHAT_SUCCESS" });
        console.log("Chat data received:", data);
        
        // Handle the response format from /api/chatdata
        const chatMessages = data.chats || [];
        const formattedChats = [];
        
        for (const chatMessage of chatMessages) {
          try {
            // Extract the message content
            const message = chatMessage.message || {};
            
            // Get user query and response
            const userQuery = typeof message === 'object' ? message.user || "" : "";
            const geminiResponse = typeof message === 'object' ? message.gemini || "" : "";
            
            const queryKeywords = extractKeywords(userQuery);
            let sources = [];
            let relatedQuestions = [];
            
            // Try to get sources and related questions from message object
            if (typeof message === 'object') {
              sources = message.sources || [];
              relatedQuestions = message.relatedQuestions || [];
            }
            
            let geminiContent = geminiResponse;
            let isPreformattedHTML = false;
            
            // Determine if content is preformatted HTML
            if (typeof message === 'object' && message.isPreformattedHTML) {
              isPreformattedHTML = true;
            } else if (chatMessage.isSearch) {
              isPreformattedHTML = true;
            }
            
            // If it was a search result, was stored as HTML, and we need to re-parse for display
            if (
              (chatMessage.isSearch || (typeof message === 'object' && message.isSearch)) &&
              typeof geminiContent === "string" &&
              isPreformattedHTML
            ) {
              const parsed = parseFormattedHTML(geminiContent, queryKeywords);
              // If parsing is successful, we now have structured data.
              if (!parsed.parsingFailed) {
                geminiContent = parsed.mainAnswer;
                sources = parsed.sources.length ? parsed.sources : sources; // Use parsed if available
                relatedQuestions = parsed.relatedQuestions.length
                  ? parsed.relatedQuestions
                  : relatedQuestions;
                isPreformattedHTML = false; // Now that we have structured data, ScrollChat can format it.
              }
              // If parsingFailed is true, isPreformattedHTML remains true, and ScrollChat will render geminiContent as HTML.
            }
            
            formattedChats.push({
              id: chatMessage._id || Math.random().toString(36).substring(2, 15),
              user: userQuery,
              gemini: geminiContent,
              timestamp: chatMessage.timestamp || new Date().toISOString(),
              isSearch: chatMessage.isSearch || false,
              searchType: chatMessage.searchType || null,
              queryKeywords,
              sources,
              relatedQuestions,
              isPreformattedHTML,
            });
          } catch (err) {
            console.error("Error processing chat message:", err, chatMessage);
          }
        }
        
        dispatch(chatAction.getChatHandler({ chat: formattedChats }));
        
        // Create previous chat format for context
        const previousChat = [];
        for (const msg of chatMessages) {
          try {
            const message = msg.message || {};
            
            if (typeof message === 'object') {
              if (message.user) {
                previousChat.push({ role: "user", parts: message.user });
              }
              if (message.gemini) {
                previousChat.push({ role: "model", parts: message.gemini });
              }
            }
          } catch (err) {
            console.error("Error processing previous chat:", err, msg);
          }
        }
        
        dispatch(
          chatAction.previousChatHandler({
            previousChat: previousChat || [],
          })
        );
      })
      .catch((err) => {
        dispatch({
          type: "GET_CHAT_FAILURE",
          error: {
            message: err.message,
            name: err.name,
            status: err.status || 500,
          },
        });
        console.error("Error in getChat:", err);
        
        // Show a more user-friendly error message
        dispatch(chatAction.getChatHandler({ chat: [] })); // Clear chat on error
        
        // Check if this is likely a chat history not found error
        const isNotFoundError = err.status === 404 || 
                               err.message.includes("not found") || 
                               err.message.includes("404");
        
        const errorMessage = isNotFoundError
          ? `<p>Chat history not found. This chat may have been deleted or the ID ${chatId} is invalid.</p>`
          : `<p>Error loading chat: ${err.message}</p><p>Please try refreshing the page.</p>`;
        
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: `Error loading chat`,
              gemini: errorMessage,
              isLoader: "no",
              error: true,
              isPreformattedHTML: true,
            },
          })
        );
        
        // If not found, we might want to redirect to a new chat
        if (isNotFoundError) {
          // Give a short delay before redirecting
          setTimeout(() => {
            dispatch(chatAction.newChatHandler());
            dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: "" }));
          }, 3000);
        }
      });
  };
};

// Placeholder for deleteChatHistory to allow compilation
export const deleteChatHistory = (chatId) => {
  return async (dispatch) => {
    console.log(
      `Placeholder: Attempting to delete chat history for ID: ${chatId}`
    );
    // Actual API call to delete on backend would go here.
    // On success, remove from recentChat list and potentially navigate away.
    // For now, this is a stub.
    // Example of optimistic update (remove from UI then call API):
    // dispatch(chatAction.removeRecentChat({ chatId }));
    // try { ... fetch ... } catch { ... re-add if failed ... }
    return Promise.resolve({ success: true }); // Simulate success
  };
};
