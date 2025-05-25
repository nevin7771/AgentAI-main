// public/src/store/day-one-agent-actions.js - ENHANCED CONVERSATION FIX
import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";

const SERVER_ENDPOINT =
  process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
const USE_PROXY = process.env.REACT_APP_USE_PROXY !== "false";
const BASE_URL = USE_PROXY ? "" : SERVER_ENDPOINT;

// Day One API endpoint
const DAY_ONE_API_URL =
  "https://new-dayone.zoomdev.us/api/v1/edo/service/ai/stream";

// Function IDs for different agent types
const FUNCTION_IDS = {
  confluence: "210169ae-760f-4fae-8a82-e16fc9b5b78f",
  monitor: "c46de244-ea9b-4a47-be9d-d40f816da925",
};

const extractKeywords = (queryStr) => {
  if (!queryStr || typeof queryStr !== "string") return [];
  return queryStr
    .toLowerCase()
    .split(" ")
    .filter((kw) => kw.trim().length > 1);
};

/**
 * Get Day One token from the server (from .env file)
 */
const getDayOneToken = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/dayone/token`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get token: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    if (!data.success || !data.token) {
      throw new Error(data.error || "Invalid token response");
    }

    return data.token;
  } catch (error) {
    console.error("Error getting Day One token:", error);
    throw error;
  }
};

/**
 * CRITICAL FIX: Enhanced conversation-aware streaming
 */
const directStreamFromDayOne = (
  agentType,
  question,
  token,
  dispatch,
  streamingId,
  navigate,
  currentChatHistoryId,
  isNewConversation = false
) => {
  return new Promise((resolve, reject) => {
    const functionId = FUNCTION_IDS[agentType];
    if (!functionId) {
      return reject(new Error(`Invalid agent type: ${agentType}`));
    }

    console.log(
      `[DirectDayOne] Starting ${agentType} stream - New: ${isNewConversation}, ChatID: ${currentChatHistoryId}`
    );
    const startTime = Date.now();
    let finalChatHistoryId = currentChatHistoryId;
    let urlUpdated = false;

    try {
      // Create fetch request to Day One API
      fetch(DAY_ONE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          functionId: functionId,
          question: question,
        }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `HTTP error ${response.status}: ${response.statusText}`
            );
          }

          // Setup reader for streaming
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let accumulatedText = "";
          let firstChunkReceived = false;

          // CRITICAL FIX: Enhanced chat history management for conversations
          const manageChatHistory = async () => {
            if (
              !isNewConversation &&
              currentChatHistoryId &&
              currentChatHistoryId.length > 5
            ) {
              console.log(
                `[DirectDayOne] Continuing existing conversation: ${currentChatHistoryId}`
              );
              finalChatHistoryId = currentChatHistoryId;

              // Update Redux state with existing ID
              dispatch(
                chatAction.chatHistoryIdHandler({
                  chatHistoryId: finalChatHistoryId,
                })
              );

              // Don't navigate for existing conversations
              urlUpdated = true;
              return;
            }

            // Create new chat history for new conversations
            if (!finalChatHistoryId || finalChatHistoryId.length < 5) {
              finalChatHistoryId = `agent_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 7)}`;
            }

            try {
              const createHistoryUrl = `${BASE_URL}/api/create-chat-history-enhanced`;
              console.log(
                `[DirectDayOne] Creating new chat history: ${finalChatHistoryId}`
              );

              const historyResponse = await fetch(createHistoryUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  title: question.substring(0, 50),
                  message: {
                    user: question,
                    gemini: "Streaming response...",
                    sources: [],
                    relatedQuestions: [],
                    queryKeywords: extractKeywords(question),
                    isPreformattedHTML: false,
                  },
                  isSearch: true,
                  searchType: "agent",
                  clientId: finalChatHistoryId,
                }),
              });

              if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                if (historyData.success && historyData.chatHistoryId) {
                  finalChatHistoryId = historyData.chatHistoryId;
                  console.log(
                    `[DirectDayOne] Created chat history: ${finalChatHistoryId}`
                  );

                  // Update Redux state immediately
                  dispatch(
                    chatAction.chatHistoryIdHandler({
                      chatHistoryId: finalChatHistoryId,
                    })
                  );

                  // Navigate to new conversation
                  if (!urlUpdated && navigate && isNewConversation) {
                    console.log(
                      `[DirectDayOne] Navigating to: /app/${finalChatHistoryId}`
                    );
                    navigate(`/app/${finalChatHistoryId}`, { replace: true });
                    urlUpdated = true;
                  }
                }
              }
            } catch (historyError) {
              console.error(
                `[DirectDayOne] Error creating chat history:`,
                historyError
              );
            }
          };

          // Process the stream
          function processStream() {
            return reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  console.log("[DirectDayOne] Stream complete");

                  const totalTime = ((Date.now() - startTime) / 1000).toFixed(
                    2
                  );
                  console.log(
                    `[DirectDayOne] Streaming completed in ${totalTime} seconds`
                  );

                  // CRITICAL FIX: Final update to mark completion
                  dispatch(
                    chatAction.updateStreamingChat({
                      streamingId: streamingId,
                      content: accumulatedText,
                      isComplete: true,
                    })
                  );

                  // CRITICAL FIX: Update chat history with final content
                  updateChatHistoryWithFinalContent(
                    finalChatHistoryId,
                    question,
                    accumulatedText,
                    isNewConversation
                  );

                  resolve({
                    text: accumulatedText,
                    sources: [],
                    success: true,
                    chatHistoryId: finalChatHistoryId,
                  });
                  return;
                }

                // Process the chunk
                const chunk = decoder.decode(value, { stream: true });
                console.log(
                  `[DirectDayOne] Processing chunk (${chunk.length} bytes)`
                );

                // CRITICAL FIX: Create chat history on first chunk
                if (!firstChunkReceived) {
                  firstChunkReceived = true;
                  manageChatHistory();
                }

                // Handle SSE format
                const lines = chunk.split("\n\n");

                for (const line of lines) {
                  if (line.trim() === "") continue;

                  if (line.startsWith("data:")) {
                    try {
                      let jsonStr = line.startsWith("data:data:")
                        ? line.substring(10).trim()
                        : line.substring(5).trim();

                      const data = JSON.parse(jsonStr);

                      if (data.message) {
                        accumulatedText += data.message;

                        // Format text for better display
                        const formattedText = accumulatedText
                          .replace(/\n\s*\*/g, "\n* ")
                          .replace(/\n\s*-/g, "\n- ")
                          .replace(/\s+\n/g, "\n")
                          .replace(/\n{3,}/g, "\n\n");

                        // CRITICAL FIX: Update UI with streamed content
                        dispatch(
                          chatAction.updateStreamingChat({
                            streamingId: streamingId,
                            content: formattedText,
                            isComplete: false,
                          })
                        );
                      }

                      if (
                        data.status === "complete" ||
                        data.complete === true
                      ) {
                        console.log(
                          "[DirectDayOne] Received completion signal"
                        );
                        reader.cancel();

                        const totalTime = (
                          (Date.now() - startTime) /
                          1000
                        ).toFixed(2);
                        console.log(
                          `[DirectDayOne] Completed in ${totalTime} seconds`
                        );

                        // Final update
                        dispatch(
                          chatAction.updateStreamingChat({
                            streamingId: streamingId,
                            content: accumulatedText,
                            isComplete: true,
                          })
                        );

                        // Update chat history
                        updateChatHistoryWithFinalContent(
                          finalChatHistoryId,
                          question,
                          accumulatedText,
                          isNewConversation
                        );

                        resolve({
                          text: accumulatedText,
                          sources: [],
                          success: true,
                          chatHistoryId: finalChatHistoryId,
                        });
                        return;
                      }
                    } catch (error) {
                      console.error(
                        "[DirectDayOne] Error processing SSE data:",
                        error
                      );
                    }
                  }
                }

                return processStream();
              })
              .catch((error) => {
                console.error("[DirectDayOne] Error reading stream:", error);
                reject(error);
              });
          }

          return processStream();
        })
        .catch((error) => {
          console.error("[DirectDayOne] Fetch error:", error);
          reject(error);
        });
    } catch (error) {
      console.error("[DirectDayOne] Error in direct streaming:", error);
      reject(error);
    }
  });
};

/**
 * CRITICAL FIX: Enhanced chat history update with proper conversation handling
 */
const updateChatHistoryWithFinalContent = async (
  chatHistoryId,
  question,
  finalContent,
  isNewConversation = false
) => {
  if (!chatHistoryId) {
    console.warn(`[DirectDayOne] No chat history ID to update`);
    return;
  }

  // Skip update for new conversations as they're handled during creation
  if (isNewConversation) {
    console.log(`[DirectDayOne] Skipping update for new conversation`);
    return;
  }

  try {
    console.log(
      `[DirectDayOne] Updating existing chat history: ${chatHistoryId}`
    );

    const updateHistoryUrl = `${BASE_URL}/api/update-chat-history`;
    const updateResponse = await fetch(updateHistoryUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        chatHistoryId: chatHistoryId,
        message: {
          user: question,
          gemini: finalContent,
          sources: [],
          relatedQuestions: [],
          queryKeywords: extractKeywords(question),
          isPreformattedHTML: false,
        },
      }),
    });

    if (updateResponse.ok) {
      const result = await updateResponse.json();
      console.log(`[DirectDayOne] Successfully updated chat history:`, result);
    } else {
      const errorText = await updateResponse.text();
      console.error(
        `[DirectDayOne] Failed to update chat history: ${updateResponse.status} - ${errorText}`
      );
    }
  } catch (error) {
    console.error(`[DirectDayOne] Error updating chat history:`, error);
  }
};

/**
 * CRITICAL FIX: Enhanced main function with proper conversation awareness
 */
export const sendDirectDayOneRequest = (requestData) => {
  return async (dispatch, getState) => {
    const { question, agentType, chatHistoryId, navigate } = requestData;
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;
    const isNewConversation = !currentChatHistoryId;

    console.log(
      `[DirectDayOne] Processing ${agentType} - New: ${isNewConversation}, ChatID: ${currentChatHistoryId}`
    );

    // Set loading state
    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    try {
      // Get token from server
      const token = await getDayOneToken();

      // CRITICAL FIX: Handle streaming differently based on conversation state
      let streamingId = `streaming_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 7)}`;

      if (isNewConversation) {
        // NEW CONVERSATION: Add loading then streaming message
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: question,
              gemini: "",
              isLoader: "yes",
              isSearch: true,
              searchType: "agent",
              queryKeywords: queryKeywords,
              sources: [],
              relatedQuestions: [],
              isPreformattedHTML: false,
            },
          })
        );

        // Replace with streaming message
        setTimeout(() => {
          dispatch(chatAction.popChat());
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: question,
                gemini: "Connecting to Day One API...",
                isLoader: "streaming",
                isSearch: true,
                searchType: "agent",
                queryKeywords: queryKeywords,
                sources: [],
                relatedQuestions: [],
                isPreformattedHTML: false,
                streamingId: streamingId,
              },
            })
          );
        }, 100);
      } else {
        // CONTINUING CONVERSATION: Add user message then agent streaming response
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: question,
              gemini: "",
              isLoader: "no",
              isSearch: false,
              searchType: null,
              queryKeywords: [],
              sources: [],
              relatedQuestions: [],
              isPreformattedHTML: false,
            },
          })
        );

        // Add streaming agent response
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: "", // Empty user for agent response
              gemini: "Connecting to Day One API...",
              isLoader: "streaming",
              isSearch: true,
              searchType: "agent",
              queryKeywords: queryKeywords,
              sources: [],
              relatedQuestions: [],
              isPreformattedHTML: false,
              streamingId: streamingId,
            },
          })
        );
      }

      // Clean up loading states
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));

      // Start streaming
      const streamResult = await directStreamFromDayOne(
        agentType,
        question,
        token,
        dispatch,
        streamingId,
        navigate,
        currentChatHistoryId,
        isNewConversation
      );

      console.log(`[DirectDayOne] Stream completed:`, streamResult);

      // Save to localStorage only for new conversations
      if (isNewConversation) {
        try {
          const existingStorageHistory = JSON.parse(
            localStorage.getItem("searchHistory") || "[]"
          );
          const historyItem = {
            id: streamResult.chatHistoryId,
            title: question.substring(0, 50),
            timestamp: new Date().toISOString(),
            type: "agent",
          };

          if (
            !existingStorageHistory.some(
              (item) => item.id === streamResult.chatHistoryId
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
          console.error(`[DirectDayOne] Error saving to localStorage:`, err);
        }
      }

      return {
        success: true,
        streamingComplete: true,
        data: {
          answer: streamResult.text,
          sources: streamResult.sources || [],
          chatHistoryId: streamResult.chatHistoryId,
        },
        shouldNavigate: isNewConversation,
        targetUrl: `/app/${streamResult.chatHistoryId}`,
      };
    } catch (error) {
      console.error(`[DirectDayOne] Error in ${agentType} request:`, error);

      // Remove loading or streaming message
      dispatch(chatAction.popChat());

      // Show error message
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: `<p>${
              agentType.charAt(0).toUpperCase() + agentType.slice(1)
            } Agent Error: ${error.message}</p>`,
            isLoader: "no",
            isSearch: true,
            searchType: "agent",
            queryKeywords: queryKeywords,
            sources: [],
            relatedQuestions: [],
            error: true,
            isPreformattedHTML: true,
          },
        })
      );

      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));

      return {
        success: false,
        streamingComplete: true,
        error: error.message,
      };
    }
  };
};

// Specific function for Confluence agent
export const sendDirectConfluenceQuestion = (requestData) => {
  console.log(
    "[DirectDayOne] Sending direct Confluence agent question:",
    requestData.question
  );
  return sendDirectDayOneRequest({
    ...requestData,
    agentType: "confluence",
  });
};

// Specific function for Monitor agent
export const sendDirectMonitorQuestion = (requestData) => {
  console.log(
    "[DirectDayOne] Sending direct Monitor agent question:",
    requestData.question
  );
  return sendDirectDayOneRequest({
    ...requestData,
    agentType: "monitor",
  });
};
