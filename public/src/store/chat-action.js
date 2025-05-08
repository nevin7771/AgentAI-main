// public/src/store/chat-action.js
// Combined and reviewed version based on user feedback and previous iterations.
// Ensures markdown rendering and keyword highlighting for historical chats.
import { chatAction } from "./chat";
import { userAction } from "./user";
import { marked } from "marked"; // Ensure marked is imported

const SERVER_ENDPOINT =
  process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
const USE_PROXY = process.env.REACT_APP_USE_PROXY !== "false";
const BASE_URL = USE_PROXY ? "" : SERVER_ENDPOINT;

const extractKeywords = (queryStr) => {
  if (!queryStr || typeof queryStr !== "string") return [];
  return queryStr
    .toLowerCase()
    .split(" ")
    .filter((kw) => kw.trim().length > 1); // User's version had > 1, keeping it
};

const filterReasonActLines = (text) => {
  if (!text || typeof text !== "string") return text;
  
  // First, remove any REASON/ACT patterns with ** markers
  let filteredText = text.replace(/\*\*REASON:\*\*.*?(?=\n\*\*ACT:|$)/gs, '');
  filteredText = filteredText.replace(/\*\*ACT:\*\*.*?(?=\n\*\*REASON:|$)/gs, '');
  
  // Next, filter lines that start with REASON: or ACT:
  const lines = filteredText.split("\n");
  const filteredLines = lines.filter(
    (line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("REASON:") && 
             !trimmed.startsWith("ACT:") &&
             !trimmed.match(/^#+\s+##\s*$/); // Also filter "# ##" pattern
    }
  );
  
  return filteredLines.join("\n");
};

// Centralized content processing: markdown parsing and keyword highlighting
const processContentForDisplay = (
  content,
  queryKeywords,
  isAlreadyHTML = false
) => {
  if (!content || typeof content !== "string") {
    return { processedContent: content || "", isHTML: isAlreadyHTML };
  }

  let currentContent = content;
  let htmlContent;

  // Always parse with marked if not already HTML, to ensure markdown is rendered.
  if (isAlreadyHTML) {
    htmlContent = currentContent;
  } else {
    const filteredContent = filterReasonActLines(currentContent);
    htmlContent = marked.parse(filteredContent.toString());
  }

  if (
    queryKeywords &&
    queryKeywords.length > 0 &&
    typeof DOMParser !== "undefined" &&
    typeof XMLSerializer !== "undefined"
  ) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");
      const walker = document.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );
      let node;
      const nodesToProcess = [];
      while ((node = walker.nextNode())) {
        if (
          node.parentElement &&
          node.parentElement.tagName.toLowerCase() !== "script" &&
          node.parentElement.tagName.toLowerCase() !== "style" &&
          !node.parentElement.classList.contains("highlighted-keyword")
        ) {
          nodesToProcess.push(node);
        }
      }

      nodesToProcess.forEach((textNode) => {
        let text = textNode.nodeValue;
        queryKeywords.forEach((keyword) => {
          if (keyword && keyword.trim() !== "") {
            const escapedKeyword = keyword.replace(
              /[.*+?^${}()|[\\]\\]/g,
              "\\$&"
            );
            const regex = new RegExp(`\\b(${escapedKeyword})\\b`, "gi");
            let match;
            let lastIndex = 0;
            const fragment = document.createDocumentFragment();
            let replaced = false;

            while ((match = regex.exec(text)) !== null) {
              replaced = true;
              if (match.index > lastIndex) {
                fragment.appendChild(
                  document.createTextNode(
                    text.substring(lastIndex, match.index)
                  )
                );
              }
              const span = document.createElement("span");
              span.className = "highlighted-keyword";
              span.textContent = match[0];
              fragment.appendChild(span);
              lastIndex = regex.lastIndex;
            }
            if (lastIndex < text.length) {
              fragment.appendChild(
                document.createTextNode(text.substring(lastIndex))
              );
            }

            if (replaced && textNode.parentNode) {
              textNode.parentNode.replaceChild(fragment, textNode);
            }
          }
        });
      });

      const serializer = new XMLSerializer();
      let newHtmlContent = serializer.serializeToString(doc.body);
      if (newHtmlContent.startsWith("<body>")) {
        newHtmlContent = newHtmlContent.substring("<body>".length);
      }
      if (newHtmlContent.endsWith("</body>")) {
        newHtmlContent = newHtmlContent.substring(
          0,
          newHtmlContent.length - "</body>".length
        );
      }
      htmlContent = newHtmlContent;
    } catch (e) {
      console.error("DOM manipulation error during highlighting:", e);
    }
  }
  return { processedContent: htmlContent, isHTML: true }; // Always return isHTML: true after processing
};

// Helper to parse HTML and extract structured data (enhanced for robustness)
const parseFormattedHTML = (htmlString) => {
  let mainAnswer = htmlString;
  const sources = [];
  const relatedQuestions = [];
  let parsingFailed = false;

  if (typeof DOMParser === "undefined") {
    return { mainAnswer, sources, relatedQuestions, parsingFailed: true };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, "text/html");

    const answerContainer =
      doc.querySelector(".gemini-answer-container") || doc.body;
    if (answerContainer) {
      const answerClone = answerContainer.cloneNode(true);
      answerClone
        .querySelectorAll(
          ".sources-section, .related-questions-section, .gemini-sources-grid, .gemini-chips-list, .source-card, .gemini-chip"
        )
        .forEach((el) => el.remove());
      mainAnswer = answerClone.innerHTML || htmlString;
    } else {
      mainAnswer = htmlString;
    }

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
    parsingFailed = true;
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
          isPreformattedHTML: false,
          isLoader: "yes",
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
        dispatch(chatAction.popChat());

        const { processedContent: finalGeminiContent, isHTML: finalIsHTML } =
          processContentForDisplay(data.gemini, queryKeywords, false);

        dispatch(
          chatAction.chatStart({
            useInput: {
              user: data.user,
              gemini: finalGeminiContent,
              isLoader: "no",
              queryKeywords: queryKeywords,
              sources: [],
              relatedQuestions: [],
              isPreformattedHTML: finalIsHTML, // Use the flag from processing
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
        dispatch(chatAction.popChat());
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
              isPreformattedHTML: true,
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
          gemini: "",
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
      dispatch(chatAction.popChat());

      let geminiContentToProcess = "Search processed.";
      let sources = [];
      let relatedQuestions = [];
      let isContentPreformattedByAgent = false;

      if (data.success) {
        if (data.result && typeof data.result.answer !== "undefined") {
          geminiContentToProcess = data.result.answer;
          sources = data.result.sources || [];
          relatedQuestions = data.result.relatedQuestions || [];
          isContentPreformattedByAgent = false;
        } else if (data.formattedHtml) {
          const parsed = parseFormattedHTML(data.formattedHtml);
          geminiContentToProcess = parsed.mainAnswer;
          sources = parsed.sources;
          relatedQuestions = parsed.relatedQuestions;
          isContentPreformattedByAgent = !parsed.parsingFailed;
        } else if (typeof data.answerHtml === "string") {
          geminiContentToProcess = data.answerHtml;
          isContentPreformattedByAgent = true;
        } else {
          geminiContentToProcess = "No answer content found.";
          isContentPreformattedByAgent = false;
        }
      } else {
        geminiContentToProcess = `<p>Search failed: ${
          data.error || "Unknown error"
        }</p>`;
        isContentPreformattedByAgent = true;
      }

      const { processedContent: finalGeminiContent, isHTML: finalIsHTML } =
        processContentForDisplay(
          geminiContentToProcess,
          queryKeywords,
          isContentPreformattedByAgent
        );

      dispatch(
        chatAction.chatStart({
          useInput: {
            user: searchRequest.query,
            gemini: finalGeminiContent,
            isLoader: "no",
            isSearch: true,
            searchType,
            usedCache: data.result?.usedCache,
            queryKeywords: queryKeywords,
            sources: sources,
            relatedQuestions: relatedQuestions,
            isPreformattedHTML: finalIsHTML, // Use the flag from processing
          },
        })
      );

      let finalChatHistoryId = data.chatHistoryId;
      if (!finalChatHistoryId && data.success) {
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
                gemini: finalGeminiContent, // Store the processed content
                sources,
                relatedQuestions,
                queryKeywords,
                isPreformattedHTML: finalIsHTML, // Store this flag
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
            window.dispatchEvent(new Event("storage"));
          }
        } catch (err) {
          console.error("Error saving search history to localStorage:", err);
        }
      }
      dispatch(chatAction.newChatHandler());
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
    console.log("[getChat] Attempting to fetch chat with ID:", chatId);
    if (!chatId) {
      console.error("[getChat] Error: chatId is undefined or null.");
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: "",
            gemini: "<p>Error: Could not load chat. Chat ID is missing.</p>",
            isLoader: "no",
            isPreformattedHTML: true,
            error: true,
          },
        })
      );
      return;
    }

    dispatch(chatAction.getChatHandler({ chats: [] }));
    dispatch(
      chatAction.chatStart({
        useInput: {
          user: "",
          gemini: "Gathering previous conversation...",
          isLoader: "yes",
          isSearch: false,
          queryKeywords: [],
          sources: [],
          relatedQuestions: [],
          isPreformattedHTML: true,
        },
      })
    );

    const url = `${BASE_URL}/api/chatdata`;
    console.log("[getChat] Fetching from URL:", url, "with chatId:", chatId);
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatHistoryId: chatId }),
    })
      .then(async (response) => {
        console.log("[getChat] Received response status:", response.status);
        if (!response.ok) {
          let errorMessage = `Server error: ${response.status} ${response.statusText}`;
          if (response.status === 404) {
            errorMessage = `Chat history not found (404): The requested chat with ID ${chatId} could not be found.`;
            console.warn(
              "[getChat] Chat ID not found (404), clearing chatHistoryId from store."
            );
            dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: null }));
            dispatch(chatAction.newChatHandler());
          } else {
            try {
              const errorBody = await response.text();
              errorMessage += `. Details: ${errorBody}`;
            } catch (e) {}
          }
          const error = new Error(errorMessage);
          error.status = response.status;
          console.error("[getChat] Fetch error:", error);
          throw error;
        }
        return response.json();
      })
      .then((data) => {
        console.log("[getChat] Received data:", data);
        dispatch(chatAction.popChat());

        const chatMessages =
          (data.chatHistory && data.chatHistory.chats) || data.chats || [];
        console.log("[getChat] Processing chatMessages:", chatMessages);

        if (chatMessages.length === 0) {
          console.log(
            "[getChat] No messages found in history for chatId:",
            chatId
          );
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: "",
                gemini: "<p>No messages found in this chat history.</p>",
                isLoader: "no",
                isPreformattedHTML: true,
              },
            })
          );
          return;
        }

        const formattedChats = chatMessages.map((chatItem) => {
          const userMessageContent =
            chatItem.message && chatItem.message.user
              ? chatItem.message.user
              : "";
          let geminiMessageContent =
            chatItem.message && chatItem.message.gemini
              ? chatItem.message.gemini
              : "";
          // For historical chats, isPreformattedHTML might be stored. If not, assume it's raw markdown.
          let isContentAlreadyHTML =
            chatItem.message &&
            typeof chatItem.message.isPreformattedHTML === "boolean"
              ? chatItem.message.isPreformattedHTML
              : false;
          let currentQueryKeywords =
            (chatItem.message && chatItem.message.queryKeywords) ||
            extractKeywords(userMessageContent);

          let finalProcessedContent = geminiMessageContent;
          let finalIsHTML = isContentAlreadyHTML;

          // Always process historical Gemini content to ensure markdown rendering and highlighting
          if (geminiMessageContent) {
            const { processedContent, isHTML } = processContentForDisplay(
              geminiMessageContent,
              currentQueryKeywords,
              isContentAlreadyHTML // Pass the flag indicating if it's already HTML
            );
            finalProcessedContent = processedContent;
            finalIsHTML = isHTML; // This will now be true after processing
          }

          console.log(
            `[getChat] Message ID ${
              chatItem._id || chatItem.id
            } processed. User: ${
              userMessageContent
                ? userMessageContent.substring(0, 50)
                : "<empty>"
            }, Gemini (first 100 chars): ${
              finalProcessedContent
                ? finalProcessedContent.substring(0, 100)
                : "<empty>"
            }`
          );
          return {
            id: chatItem._id || chatItem.id || Math.random().toString(),
            user: userMessageContent,
            gemini: finalProcessedContent,
            isLoader: "no",
            isSearch: chatItem.isSearch || false,
            searchType: chatItem.searchType,
            queryKeywords: currentQueryKeywords,
            sources: (chatItem.message && chatItem.message.sources) || [],
            relatedQuestions:
              (chatItem.message && chatItem.message.relatedQuestions) || [],
            isPreformattedHTML: finalIsHTML, // Crucially, this is now true
            error: chatItem.error || null,
            timestamp: chatItem.timestamp || new Date().toISOString(),
          };
        });
        console.log(
          "[getChat] Dispatching getChatHandler with formattedChats:",
          formattedChats
        );
        dispatch(chatAction.getChatHandler({ chats: formattedChats }));
      })
      .catch((err) => {
        dispatch(chatAction.popChat());
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: "",
              gemini: `<p>Error loading chat: ${err.message}</p>`,
              isLoader: "no",
              isPreformattedHTML: true,
              error: true,
            },
          })
        );
        console.error("Error in getChat catch block:", err);
      });
  };
};

export const deleteChatHistory = (chatId) => {
  return async (dispatch) => {
    dispatch({ type: "DELETE_CHAT_HISTORY_REQUEST", payload: chatId });
    const url = `${BASE_URL}/gemini/api/deletechathistory`;
    try {
      const response = await fetch(url, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatHistoryId: chatId }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ message: "Failed to delete chat history" }));
        throw new Error(
          errorData.message || `Server error: ${response.status}`
        );
      }

      await response.json();

      dispatch({ type: "DELETE_CHAT_HISTORY_SUCCESS", payload: chatId });
      dispatch(chatAction.removeChatHistory({ chatId }));
      dispatch(getRecentChat());
    } catch (error) {
      console.error("Error deleting chat history:", error);
      dispatch({
        type: "DELETE_CHAT_HISTORY_FAILURE",
        payload: { chatId, error: error.message },
      });
    }
  };
};
