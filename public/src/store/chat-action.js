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
          // Create a fallback HTML that matches the expected format from the server
          let answer = "";
          if (data.result) {
            answer = typeof data.result === 'object' 
              ? (data.result.answer || JSON.stringify(data.result, null, 2))
              : String(data.result);
          }
          
          // Format the answer text
          answer = answer.replace(/\n/g, "<br>");
          
          // Create a well-formatted search result that matches the expected styling
          data.formattedHtml = `
            <div class="simple-search-results">
              <h3>${searchType === 'simple' ? 'Quick Answer' : 'Research Results'}</h3>
              
              <div class="search-content-wrapper">
                <div class="search-main-content">
                  <p>${answer}</p>
                </div>
              </div>
              
              <div class="search-key-points">
                <h4>Key Points</h4>
                <ul>
                  <li>This is a ${searchType} search result</li>
                  <li>For more detailed information, try using the Deep Search option</li>
                </ul>
              </div>
              
              <div class="search-related-section">
                <h4>Next Steps</h4>
                <p>You can try:</p>
                <ul>
                  <li>Asking a more specific question</li>
                  <li>Using Deep Search for comprehensive results</li>
                  <li>Trying Agent search for specialized knowledge</li>
                </ul>
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

        // Generate a chat history ID if not provided by server
        const chatHistoryId = data.chatHistoryId || 
          `search_${searchType}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        // Save the chat history ID
        dispatch(
          chatAction.chatHistoryIdHandler({
            chatHistoryId: chatHistoryId,
          })
        );
        
        // Store in localStorage for sidebar history (matches agent behavior)
        try {
          // Get existing history from localStorage or initialize empty array
          const existingHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
          
          // Add new item to history
          const historyItem = {
            id: chatHistoryId,
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
          console.log(`Added search "${searchRequest.query}" to history with ID: ${chatHistoryId}`);
          
          // Trigger a storage event to update sidebar
          window.dispatchEvent(new Event('storage'));
        } catch (err) {
          console.error('Error saving search history to localStorage:', err);
        }
        
        // If we don't have a server-provided ID, create the chat history on server
        if (!data.chatHistoryId) {
          console.log("Creating new search history on server");
          
          try {
            // First try with proxy approach
            let url = `/api/create-chat-history`; 
            let historyResponse;
            
            try {
              console.log(`Attempting to create search history via proxy: ${url}`);
              // Create the chat history on the server
              historyResponse = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Accept": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  title: searchRequest.query || `${searchType} search`,
                  message: {
                    user: searchRequest.query,
                    gemini: data.formattedHtml,
                  },
                  isSearch: true,
                  searchType: searchType,
                }),
              });
              
              // If fetch worked but returned an error, try the direct URL
              if (!historyResponse.ok) {
                const statusCode = historyResponse.status;
                console.warn(`Proxy create search history failed with status ${statusCode}, trying direct URL...`);
                throw new Error(`Server Error: ${statusCode}`);
              }
            } catch (proxyError) {
              console.error("Proxy create search history failed:", proxyError);
              
              // Try direct URL as a fallback
              url = `${SERVER_ENDPOINT}/api/create-chat-history`;
              console.log(`Trying direct URL for create search history: ${url}`);
              
              historyResponse = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Accept": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  title: searchRequest.query || `${searchType} search`,
                  message: {
                    user: searchRequest.query,
                    gemini: data.formattedHtml,
                  },
                  isSearch: true,
                  searchType: searchType,
                }),
              });
            }
            
            if (historyResponse.ok) {
              const historyData = await historyResponse.json();
              if (historyData.success && historyData.chatHistoryId) {
                console.log(
                  "Search history created on server with ID:",
                  historyData.chatHistoryId
                );
                
                // Update chat history ID with the one from the server
                dispatch(
                  chatAction.chatHistoryIdHandler({
                    chatHistoryId: historyData.chatHistoryId,
                  })
                );
                
                // Update the localStorage entry with the server ID
                try {
                  const existingHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
                  
                  // Find and update the temporary ID
                  const updatedHistory = existingHistory.map(item => {
                    if (item.id === chatHistoryId) {
                      return { ...item, id: historyData.chatHistoryId };
                    }
                    return item;
                  });
                  
                  localStorage.setItem('searchHistory', JSON.stringify(updatedHistory));
                  console.log("Updated localStorage with server search history ID");
                  
                  // Update the URL if we're on a dedicated chat page
                  if (window.location.pathname.includes('/app/')) {
                    window.history.replaceState(
                      null, 
                      '', 
                      `/app/${historyData.chatHistoryId}`
                    );
                  }
                } catch (err) {
                  console.error('Error updating localStorage history ID:', err);
                }
              }
            }
          } catch (error) {
            console.error("Error creating search history:", error);
          }
        } else {
          // If we already have a server ID, update the URL if we're on a dedicated chat page
          if (window.location.pathname.includes('/app/')) {
            window.history.replaceState(
              null, 
              '', 
              `/app/${data.chatHistoryId}`
            );
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
    
    // Check if the ID starts with "agent_" - if so, we should look in localStorage first
    const isAgentChat = chatHistoryId.startsWith("agent_");
    
    // Always check localStorage first for agent chats
    if (isAgentChat) {
      console.log(`This appears to be an agent chat (${chatHistoryId}), checking localStorage first`);
      try {
        const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
        const localChat = savedChats.find(chat => chat.id === chatHistoryId);
        
        if (localChat) {
          console.log("Found agent chat in localStorage, restoring:", localChat);
          
          // Create a normalized version of the chat
          const chats = [{
            user: localChat.user,
            gemini: localChat.gemini,
            id: Date.now(),
            isLoader: "no",
            isSearch: true,
            searchType: "agent"
          }];
          
          // Update the store
          dispatch(chatAction.replaceChat({ chats }));
          dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId }));
          dispatch(chatAction.loaderHandler()); // Turn off loader
          
          return Promise.resolve({ fromLocalStorage: true });
        }
      } catch (err) {
        console.error("Error checking localStorage for agent chat:", err);
      }
    }
    
    // If not found in localStorage or not an agent chat, try the server
    const url = `${BASE_URL}/gemini/api/chatdata`;

    return new Promise((resolve, reject) => {
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
            throw new Error(`Server error: ${response.status}`);
          }
          return response.json();
        })
        .then((data) => {
          dispatch(chatAction.loaderHandler());
          
          // Don't continue if we don't have chat data
          if (!data.chats || data.chats.length === 0) {
            throw new Error("No chat data returned");
          }
          
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
              // Add these properties to preserve chat type
              isSearch: c.isSearch || c.searchType ? true : false,
              searchType: c.searchType,
            };
          });

          const historyId = data.chatHistory;

          dispatch(chatAction.replacePreviousChat({ previousChat }));
          dispatch(chatAction.replaceChat({ chats }));
          dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: historyId }));
          dispatch(chatAction.newChatHandler());
          
          resolve(data);
        })
        .catch((err) => {
          console.error("Error fetching chat:", err);
          dispatch(chatAction.loaderHandler());
          
          // Also check localStorage before giving up
          try {
            const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
            const localChat = savedChats.find(chat => chat.id === chatHistoryId);
            
            if (localChat) {
              console.log("Found chat in localStorage, will be restored by component");
              resolve({ fromLocalStorage: true });
              return;
            }
          } catch (localErr) {
            console.error("Error checking localStorage:", localErr);
          }
          
          // Show error message
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
          dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId }));
          reject(err);
        });
    });
  };
};

export const deleteChatHistory = (chatHistoryId) => {
  return (dispatch) => {
    // Handle agent chats (which might only exist in localStorage)
    const isAgentChat = chatHistoryId.startsWith("agent_");
    
    // For agent chats, always remove from localStorage
    if (isAgentChat) {
      try {
        const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
        const filteredChats = savedChats.filter(chat => chat.id !== chatHistoryId);
        localStorage.setItem("savedChats", JSON.stringify(filteredChats));
        console.log(`Removed agent chat ${chatHistoryId} from localStorage`);
        
        // For agent chats, we might not have a server record, so we can consider this successful
        // even if the server delete fails
        const promise = new Promise((resolve) => {
          // Always resolve after a timeout even if server call fails
          setTimeout(() => resolve({ success: true, fromLocalStorage: true }), 2000);
          
          // Try server delete in parallel, but don't wait for it
          const url = `${BASE_URL}/api/chat-history/${chatHistoryId}`;
          fetch(url, {
            method: "DELETE",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
          }).then(response => {
            if (response.ok) {
              console.log(`Successfully deleted agent chat ${chatHistoryId} from server too`);
            }
          }).catch(err => {
            console.warn(`Server delete failed for agent chat, but removed from localStorage: ${err.message}`);
          });
        });
        
        // After deletion, make sure to update the UI
        dispatch(getRecentChat());
        
        return promise;
      } catch (err) {
        console.error("Error removing from localStorage:", err);
        // Still try server delete as fallback
      }
    }
    
    // Standard server deletion
    const url = `${BASE_URL}/api/chat-history/${chatHistoryId}`;
    
    return new Promise((resolve, reject) => {
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
        .then((data) => {
          // After successful deletion, update the recent chats
          dispatch(getRecentChat());
          // Navigate to home if we're currently viewing this chat
          const currentChatHistoryId = window.location.pathname.split("/").pop();
          if (currentChatHistoryId === chatHistoryId) {
            window.location.href = "/";
          }
          resolve(data);
        })
        .catch((error) => {
          console.error("Error deleting chat history:", error);
          reject(error);
        });
    });
  };
};
