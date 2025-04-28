// public/src/store/chat-action.js
// Complete version with all required functions

import { chatAction } from "./chat";
import { userAction } from "./user";

// Get the server endpoint from environment variable or use default localhost in development
const SERVER_ENDPOINT = process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
// Use proxy in development for direct API calls
const USE_PROXY = process.env.REACT_APP_USE_PROXY !== 'false';
// Base URL: empty string when using proxy, or explicit server endpoint
const BASE_URL = USE_PROXY ? '' : SERVER_ENDPOINT;

export const getRecentChat = () => {
  return (dispatch) => {
    dispatch({ type: "GET_RECENT_CHAT_REQUEST" });

    const url = `${BASE_URL}/gemini/api/getchathistory`;

    fetch(url, {
      method: "GET",
      credentials: "include",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("server error");
        }

        return response.json();
      })
      .then((data) => {
        dispatch({ type: "GET_RECENT_CHAT_SUCCESS" });
        dispatch(
          chatAction.recentChatHandler({ recentChat: data.chatHistory })
        );
        dispatch(userAction.setLocation({ location: data.location }));
      })
      .catch((err) => {
        dispatch({ type: "GET_RECENT_CHAT_FAILURE", error: err });
        console.log(err);
      });
  };
};

export const sendChatData = (useInput) => {
  return (dispatch) => {
    dispatch(chatAction.chatStart({ useInput: useInput }));

    const apiKey = process.env.REACT_APP_GEMINI_KEY;

    const url = `${BASE_URL}/gemini/api/chat`;

    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
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
        dispatch(chatAction.popChat());
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: data.user,
              gemini: data.gemini,
              isLoader: "no",
            },
          })
        );
        if (useInput.chatHistoryId.length < 2) {
          // Use a delay to ensure server-side operations complete before fetching recent chats
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

        dispatch(chatAction.popChat());
        if (statusCode === 429) {
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: useInput.user,
                gemini:
                  "<span>Rate Limit Exceeded. Please wait for one hour before trying again. Thank you for your patience.</span>",
                isLoader: "no",
              },
            })
          );
        } else {
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: useInput.user,
                gemini:
                  "<span>Oops! Something went wrong on our end. Please refresh the page and try again. If the issue persists, please contact us for assistance.</span>",
                isLoader: "no",
              },
            })
          );
        }
        dispatch(chatAction.newChatHandler());
      });
  };
};

export const sendDeepSearchRequest = (searchRequest) => {
  return async (dispatch) => {
    dispatch(chatAction.loaderHandler());

    // Create a loading state
    dispatch(
      chatAction.chatStart({
        useInput: {
          user: searchRequest.query,
          gemini: "",
          isLoader: "yes",
        },
      })
    );

    // Determine search type (simple or deep)
    const searchType = searchRequest.endpoint.includes("simplesearch")
      ? "simple"
      : "deep";

    console.log(`Starting ${searchType} search for query: "${searchRequest.query}"`);

    // Try with fetch API first, then fallback to XMLHttpRequest if needed
    try {
      // First try with proxy approach
      let url = `${searchRequest.endpoint || "/api/deepsearch"}`; // Start with just the path for proxy
      if (!url.startsWith('/')) url = '/' + url; // Make sure it starts with /

      console.log(`Sending ${searchType} search request to: ${url} (proxy mode)`);
      
      // First attempt - with proxy
      let response;
      try {
        response = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            query: searchRequest.query,
            sources: searchRequest.sources || [
              "support.zoom.us",
              "community.zoom.us",
              "zoom.us",
            ],
            chatHistoryId: searchRequest.chatHistoryId,
          }),
        });
        
        // If fetch worked but returned an error, let it bubble up to the outer try/catch
        if (!response.ok) {
          const statusCode = response.status;
          console.warn(`Proxy search request failed with status ${statusCode}, trying direct URL...`);
          throw new Error(`Server Error: ${statusCode}`);
        }
      } catch (proxyError) {
        console.error("Proxy search request failed:", proxyError);
        
        // Try direct URL as a fallback
        console.log(`Trying direct URL for ${searchType} search...`);
        url = `${SERVER_ENDPOINT}${searchRequest.endpoint || "/api/deepsearch"}`;
        console.log(`Sending ${searchType} search request to: ${url} (direct mode)`);
        
        response = await fetch(url, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            query: searchRequest.query,
            sources: searchRequest.sources || [
              "support.zoom.us",
              "community.zoom.us",
              "zoom.us",
            ],
            chatHistoryId: searchRequest.chatHistoryId,
          }),
        });

        if (!response.ok) {
          const statusCode = response.status;
          throw new Error(`Server Error: ${statusCode}`);
        }
      }

      // Process the response data
      const data = await response.json();
      console.log(`${searchType} search response:`, data);

      // Remove the loading message
      dispatch(chatAction.popChat());

      if (data.success) {
        // Check if the result came from cache
        const usedCache = data.result && data.result.usedCache;

        // Check if we have formattedHtml, if not create a fallback
        if (!data.formattedHtml && data.result) {
          // Create a fallback HTML if server didn't provide formatted HTML
          const answer = data.result.answer || JSON.stringify(data.result);
          data.formattedHtml = `
            <div class="${searchType}-search-results">
              <h3>${searchType === 'simple' ? 'Quick Answer' : 'Research Results'}</h3>
              <div class="${searchType}-search-content">
                <p>${answer}</p>
              </div>
            </div>
          `;
        }

        // Add the formatted HTML response to the chat
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: searchRequest.query,
              gemini: data.formattedHtml,
              isLoader: "no",
              isDeepSearch: true,
              isSearch: true,
              searchType,
              usedCache: usedCache, // Add cache indicator
            },
          })
        );

        // If we received a chat history ID from server, save it
        if (data.chatHistoryId) {
          dispatch(
            chatAction.chatHistoryIdHandler({
              chatHistoryId: data.chatHistoryId,
            })
          );
          
          // Store in localStorage for sidebar history (matches agent behavior)
          try {
            // Get existing history from localStorage or initialize empty array
            const existingHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
            
            // Add new item to history
            const historyItem = {
              id: data.chatHistoryId,
              title: searchRequest.query || `${searchType.charAt(0).toUpperCase() + searchType.slice(1)} Search`,
              timestamp: new Date().toISOString(),
              type: searchType
            };
            
            // Add to beginning of array (most recent first)
            existingHistory.unshift(historyItem);
            
            // Limit history to 50 items
            const limitedHistory = existingHistory.slice(0, 50);
            
            // Save back to localStorage
            localStorage.setItem('searchHistory', JSON.stringify(limitedHistory));
          } catch (err) {
            console.error('Error saving search history to localStorage:', err);
          }
        }

        // Make sure to update recent chats
        setTimeout(() => {
          dispatch(getRecentChat());
        }, 800);
      } else {
        // Display error message
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: searchRequest.query,
              gemini: `<div class="${searchType}-search-results error"><h3>Search Error</h3><p>Sorry, there was an error: ${data.error || 'Unknown error'}</p></div>`,
              isLoader: "no",
              isSearch: true,
              searchType: searchType,
            },
          })
        );
      }

      // Update UI
      dispatch(chatAction.newChatHandler());
    } catch (err) {
      console.error(`${searchType} search API error:`, err);
      dispatch(chatAction.popChat());

      dispatch(
        chatAction.chatStart({
          useInput: {
            user: searchRequest.query,
            gemini: `<div class="${searchType}-search-results error">
              <h3>Search Error</h3>
              <p>Sorry, there was an error processing your search request: ${err.message || 'Unknown error'}</p>
              <p>Please try again later or try a different search option.</p>
            </div>`,
            isLoader: "no",
            isSearch: true,
            searchType: searchType,
          },
        })
      );

      dispatch(chatAction.newChatHandler());
    } finally {
      dispatch(chatAction.loaderHandler());
    }
  };
};

export const getChat = (chatHistoryId) => {
  return (dispatch) => {
    dispatch(chatAction.loaderHandler());
    const url = `${BASE_URL}/gemini/api/chatdata`;

    fetch(url, {
      method: "POST",
      body: JSON.stringify({ chatHistoryId }),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("server error");
        }
        return response.json();
      })
      .then((data) => {
        dispatch(chatAction.loaderHandler());
        const previousChat = data.chats.flatMap((c) => [
          { role: "user", parts: c.message.user },
          { role: "model", parts: c.message.gemini },
        ]);

        const chats = data.chats.map((c) => {
          return {
            user: c.message.user,
            gemini: c.message.gemini,
            id: c._id,
            isLoader: "no",
          };
        });

        const chatHistoryId = data.chatHistory;

        dispatch(chatAction.replacePreviousChat({ previousChat }));
        dispatch(chatAction.replaceChat({ chats }));
        dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId }));
        dispatch(chatAction.newChatHandler());
      })
      .catch((err) => {
        console.log(err);
        dispatch(
          chatAction.replaceChat({
            chats: [
              {
                error: true,
                user: "Hi, is there any issue ? ",
                gemini: "",
                id: 34356556565,
                isLoader: "Oops! I couldn't find your chat history",
              },
            ],
          })
        );
        dispatch(chatAction.loaderHandler());
        dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId }));
      });
  };
};

export const deleteChatHistory = (chatHistoryId) => {
  return (dispatch) => {
    const url = `${BASE_URL}/api/chat-history/${chatHistoryId}`;

    fetch(url, {
      method: "DELETE",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to delete chat history");
        }
        return response.json();
      })
      .then(() => {
        // After successful deletion, update the recent chats
        dispatch(getRecentChat());
        // Navigate to home if we're currently viewing this chat
        const currentChatHistoryId = window.location.pathname.split("/").pop();
        if (currentChatHistoryId === chatHistoryId) {
          window.location.href = "/";
        }
      })
      .catch((error) => {
        console.error("Error deleting chat history:", error);
        alert("Failed to delete chat history. Please try again.");
      });
  };
};
