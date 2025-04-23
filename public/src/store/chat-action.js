// public/src/store/chat-action.js
// Complete version with all required functions

import { chatAction } from "./chat";
import { userAction } from "./user";

const SERVER_ENDPOINT = process.env.REACT_APP_SERVER_ENDPOINT;

export const getRecentChat = () => {
  return (dispatch) => {
    dispatch({ type: "GET_RECENT_CHAT_REQUEST" });

    const url = `${SERVER_ENDPOINT}/gemini/api/getchathistory`;

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

    const url = `${SERVER_ENDPOINT}/gemini/api/chat`;

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
  return (dispatch) => {
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
    const searchType = searchRequest.endpoint.includes("simplesearch") ? "simple" : "deep";

    const apiKey = process.env.REACT_APP_GEMINI_KEY;
    // Use the endpoint from the request, or default to deepsearch
    const url = `${SERVER_ENDPOINT}${searchRequest.endpoint || "/api/deepsearch"}`;

    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        query: searchRequest.query,
        sources: searchRequest.sources || [
          "support.zoom.us",
          "community.zoom.us",
          "zoom.us",
        ],
        // No need for saveToHistory flag anymore as we always try to save
        chatHistoryId: searchRequest.chatHistoryId // Pass existing history ID if available
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
        // Remove the loading message
        dispatch(chatAction.popChat());

        if (data.success) {
          // Add the formatted HTML response to the chat
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: searchRequest.query,
                gemini: data.formattedHtml,
                isLoader: "no",
                isDeepSearch: true,
                isSearch: true,
                searchType
              },
            })
          );
          
          // If we received a chat history ID from server, save it
          if (data.chatHistoryId) {
            dispatch(
              chatAction.chatHistoryIdHandler({ chatHistoryId: data.chatHistoryId })
            );
          }
          
          // Make sure to update recent chats with a longer delay to ensure server-side processing completes
          setTimeout(() => {
            dispatch(getRecentChat());
          }, 800);
        } else {
          // Display error message
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: searchRequest.query,
                gemini: `<div class="deep-search-results"><h3>Search Error</h3><p>Sorry, there was an error: ${data.error}</p></div>`,
                isLoader: "no",
              },
            })
          );
        }

        // Update UI
        dispatch(chatAction.newChatHandler());
      })
      .catch((err) => {
        console.error("Search API error:", err);
        dispatch(chatAction.popChat());

        dispatch(
          chatAction.chatStart({
            useInput: {
              user: searchRequest.query,
              gemini:
                '<div class="deep-search-results"><h3>Search Error</h3><p>Sorry, there was an error processing your search request. Please try again later.</p></div>',
              isLoader: "no",
            },
          })
        );

        dispatch(chatAction.newChatHandler());
      })
      .finally(() => {
        dispatch(chatAction.loaderHandler());
      });
  };
};

export const getChat = (chatHistoryId) => {
  return (dispatch) => {
    dispatch(chatAction.loaderHandler());
    const url = `${SERVER_ENDPOINT}/gemini/api/chatdata`;

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
