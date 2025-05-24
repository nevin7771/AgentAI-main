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
 * CRITICAL FIX: Connect directly to the Day One API for streaming responses with immediate display
 */
const directStreamFromDayOne = (
  agentType,
  question,
  token,
  dispatch,
  streamingId,
  navigate,
  currentChatHistoryId
) => {
  return new Promise((resolve, reject) => {
    const functionId = FUNCTION_IDS[agentType];
    if (!functionId) {
      return reject(new Error(`Invalid agent type: ${agentType}`));
    }

    console.log(
      `[DirectDayOne] Connecting directly to Day One API for ${agentType} agent`
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

          // CRITICAL FIX: Create chat history as soon as streaming starts
          const createChatHistoryEarly = async () => {
            if (!finalChatHistoryId || finalChatHistoryId.length < 5) {
              finalChatHistoryId = `agent_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 7)}`;
            }

            try {
              const createHistoryUrl = `${BASE_URL}/api/create-chat-history`;
              console.log(
                `[DirectDayOne] Creating early chat history: ${finalChatHistoryId}`
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
                    gemini: "Streaming response...", // Placeholder
                    sources: [],
                    relatedQuestions: [],
                    queryKeywords: extractKeywords(question),
                    isPreformattedHTML: false,
                  },
                  isSearch: true,
                  searchType: "agent",
                }),
              });

              if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                if (historyData.success && historyData.chatHistoryId) {
                  finalChatHistoryId = historyData.chatHistoryId;
                  console.log(
                    `[DirectDayOne] Created early chat history: ${finalChatHistoryId}`
                  );

                  // CRITICAL FIX: Update Redux state immediately
                  dispatch(
                    chatAction.chatHistoryIdHandler({
                      chatHistoryId: finalChatHistoryId,
                    })
                  );

                  // CRITICAL FIX: Navigate to the proper URL immediately
                  if (!urlUpdated && navigate) {
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
                `[DirectDayOne] Error creating early chat history:`,
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

                  // Calculate total time
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

                  // CRITICAL FIX: Update the chat history with final content
                  updateChatHistoryWithFinalContent(
                    finalChatHistoryId,
                    question,
                    accumulatedText
                  );

                  // Resolve the promise with the final text
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
                  `[DirectDayOne] Raw chunk (${
                    chunk.length
                  } bytes): ${chunk.substring(0, 40)}...`
                );

                // CRITICAL FIX: Create chat history on first chunk
                if (!firstChunkReceived) {
                  firstChunkReceived = true;
                  createChatHistoryEarly();
                }

                // Handle SSE format
                const lines = chunk.split("\n\n");

                for (const line of lines) {
                  if (line.trim() === "") continue;

                  // Handle data lines
                  if (line.startsWith("data:")) {
                    try {
                      // Extract JSON data - handle possible double data: prefix
                      let jsonStr = line.startsWith("data:data:")
                        ? line.substring(10).trim()
                        : line.substring(5).trim();

                      // Parse the JSON data
                      const data = JSON.parse(jsonStr);
                      console.log("[DirectDayOne] Parsed data:", data);

                      // Update accumulated text
                      if (data.message) {
                        accumulatedText += data.message;

                        // Format text for better display
                        const formattedText = accumulatedText
                          .replace(/\n\s*\*/g, "\n* ")
                          .replace(/\n\s*-/g, "\n- ")
                          .replace(/\s+\n/g, "\n")
                          .replace(/\n{3,}/g, "\n\n");

                        // CRITICAL FIX: Update UI immediately with streamed content
                        dispatch(
                          chatAction.updateStreamingChat({
                            streamingId: streamingId,
                            content: formattedText,
                            isComplete: false,
                          })
                        );
                      }

                      // Check if streaming is complete
                      if (
                        data.status === "complete" ||
                        data.complete === true
                      ) {
                        console.log(
                          "[DirectDayOne] Received completion signal"
                        );
                        reader.cancel();

                        // Calculate total time
                        const totalTime = (
                          (Date.now() - startTime) /
                          1000
                        ).toFixed(2);
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

                        // Update chat history with final content
                        updateChatHistoryWithFinalContent(
                          finalChatHistoryId,
                          question,
                          accumulatedText
                        );

                        // Resolve the promise with the final text
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
                        error,
                        "Raw line:",
                        line
                      );
                    }
                  }
                }

                // Continue reading
                return processStream();
              })
              .catch((error) => {
                console.error("[DirectDayOne] Error reading stream:", error);
                reject(error);
              });
          }

          // Start processing the stream
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
 * CRITICAL FIX: Update chat history with final content for conversation continuation
 */
const updateChatHistoryWithFinalContent = async (
  chatHistoryId,
  question,
  finalContent
) => {
  if (!chatHistoryId) return;

  try {
    console.log(
      `[DirectDayOne] Updating chat history ${chatHistoryId} with final content`
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
      console.log(`[DirectDayOne] Successfully updated chat history`);
    } else {
      console.error(
        `[DirectDayOne] Failed to update chat history:`,
        updateResponse.status
      );
    }
  } catch (error) {
    console.error(`[DirectDayOne] Error updating chat history:`, error);
  }
};

/**
 * CRITICAL FIX: Main function for direct Day One streaming requests with immediate streaming
 */
export const sendDirectDayOneRequest = (requestData) => {
  return async (dispatch, getState) => {
    const { question, agentType, chatHistoryId, navigate } = requestData;
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;

    console.log(
      `[DirectDayOne] Starting ${agentType} request for: "${question}"`
    );
    console.log(
      `[DirectDayOne] Current chat history ID: ${currentChatHistoryId}`
    );

    // Set loading state
    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    // CRITICAL FIX: Dispatch initial loading message immediately
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

    try {
      // Get token from server
      console.log(`[DirectDayOne] Getting token for ${agentType} agent`);
      const token = await getDayOneToken();

      // CRITICAL FIX: Remove the loading message and add streaming message immediately
      dispatch(chatAction.popChat());

      // Add a streaming message that will be updated in real-time
      const streamingId = `streaming_${Date.now()}`;
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

      // CRITICAL FIX: Clean up loading states immediately since streaming will handle its own state
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));

      // CRITICAL FIX: Start streaming immediately (don't await completion)
      console.log(`[DirectDayOne] Starting immediate stream for ${agentType}`);

      const streamResult = await directStreamFromDayOne(
        agentType,
        question,
        token,
        dispatch,
        streamingId,
        navigate,
        currentChatHistoryId
      );

      console.log(`[DirectDayOne] Stream completed:`, streamResult);

      // CRITICAL FIX: Save to localStorage
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
        console.log(
          `[DirectDayOne] Saved to localStorage: ${streamResult.chatHistoryId}`
        );
      } catch (err) {
        console.error(
          `[DirectDayOne] Error saving ${agentType} agent chat history to localStorage:`,
          err
        );
      }

      // CRITICAL FIX: Return success with data for continuation
      console.log(
        `[DirectDayOne] Returning success response with chatHistoryId: ${streamResult.chatHistoryId}`
      );

      return {
        success: true,
        streamingComplete: true,
        data: {
          answer: streamResult.text,
          sources: streamResult.sources || [],
          chatHistoryId: streamResult.chatHistoryId,
        },
        shouldNavigate: false, // Navigation already handled
        targetUrl: `/app/${streamResult.chatHistoryId}`,
      };
    } catch (error) {
      console.error(
        `[DirectDayOne] Error in ${agentType} streaming request:`,
        error.message
      );

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

      // Clean up loading states
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
