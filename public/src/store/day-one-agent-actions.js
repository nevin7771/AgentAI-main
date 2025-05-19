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
  monitor: "c46de244-ea9b-4a47-be9d-d40f816da925", // Replace with actual ID
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
 * Connect directly to the Day One API for streaming responses
 */
const directStreamFromDayOne = (
  agentType,
  question,
  token,
  dispatch,
  streamingId
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

                  // Final update to the UI
                  dispatch(
                    chatAction.updateStreamingChat({
                      streamingId: streamingId,
                      content: accumulatedText,
                      isComplete: true,
                    })
                  );

                  // Resolve the promise with the final text
                  resolve(accumulatedText);
                  return;
                }

                // Process the chunk
                const chunk = decoder.decode(value, { stream: true });
                console.log(
                  `[DirectDayOne] Raw chunk (${
                    chunk.length
                  } bytes): ${chunk.substring(0, 40)}...`
                );

                // Handle SSE format
                const lines = chunk.split("\n\n");

                for (const line of lines) {
                  if (line.trim() === "") continue;

                  // Handle data lines
                  if (line.startsWith("data:")) {
                    try {
                      // Extract JSON data - handle possible double data: prefix
                      let jsonStr = line.startsWith("data:data:")
                        ? line.substring(10).trim() // Double prefix
                        : line.substring(5).trim(); // Single prefix

                      // Parse the JSON data
                      const data = JSON.parse(jsonStr);
                      console.log("[DirectDayOne] Parsed data:", data);

                      // Update accumulated text
                      if (data.message) {
                        accumulatedText += data.message;

                        // Format text for better display
                        const formattedText = accumulatedText
                          .replace(/\n\s*\*/g, "\n* ") // Fix bullet points
                          .replace(/\n\s*-/g, "\n- ") // Fix dashes
                          .replace(/\s+\n/g, "\n") // Remove extra spaces before newlines
                          .replace(/\n{3,}/g, "\n\n"); // Reduce multiple newlines

                        // Update UI with streamed content
                        dispatch(
                          chatAction.updateStreamingChat({
                            streamingId: streamingId,
                            content: formattedText,
                            isComplete: data.status === "complete",
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

                        // Final update to the UI
                        dispatch(
                          chatAction.updateStreamingChat({
                            streamingId: streamingId,
                            content: accumulatedText,
                            isComplete: true,
                          })
                        );

                        // Resolve the promise with the final text
                        resolve(accumulatedText);
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
 * Main function for direct Day One streaming requests
 */
export const sendDirectDayOneRequest = (requestData) => {
  return async (dispatch, getState) => {
    const { question, agentType, chatHistoryId, navigate } = requestData;
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;

    // Set loading state
    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    // Dispatch initial loading message to the chat
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

    // Navigate to /app to show the streaming response
    setTimeout(() => {
      if (navigate && typeof navigate === "function") {
        navigate("/app");
      }
    }, 100);

    try {
      // Get token from server
      console.log(`[DirectDayOne] Getting token for ${agentType} agent`);
      const token = await getDayOneToken();

      // Remove the loading message before starting stream
      dispatch(chatAction.popChat());

      // Add a streaming message that will be updated
      const streamingId = `streaming_${Date.now()}`;
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: "Connecting directly to Day One API...",
            isLoader: "streaming", // Special loader type for streaming
            isSearch: true,
            searchType: "agent",
            queryKeywords: queryKeywords,
            sources: [],
            relatedQuestions: [],
            isPreformattedHTML: true,
            streamingId: streamingId, // Unique ID for the streaming message
          },
        })
      );

      // Direct streaming from Day One API
      const finalText = await directStreamFromDayOne(
        agentType,
        question,
        token,
        dispatch,
        streamingId
      );

      // After streaming is complete, create a chat history record
      let finalChatHistoryId = currentChatHistoryId;
      if (!finalChatHistoryId || finalChatHistoryId.length < 2) {
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
              title: question.substring(0, 50),
              message: {
                user: question,
                gemini: finalText,
                sources: [],
                relatedQuestions: [],
                queryKeywords,
                isPreformattedHTML: true,
              },
              isSearch: true,
              searchType: "agent",
            }),
          });

          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            if (historyData.success && historyData.chatHistoryId)
              finalChatHistoryId = historyData.chatHistoryId;
          }
        } catch (historyError) {
          console.error(
            `[DirectDayOne] Error creating chat history for ${agentType} agent:`,
            historyError
          );
        }
      }

      if (finalChatHistoryId) {
        dispatch(
          chatAction.chatHistoryIdHandler({
            chatHistoryId: finalChatHistoryId,
          })
        );

        try {
          const existingStorageHistory = JSON.parse(
            localStorage.getItem("searchHistory") || "[]"
          );
          const historyItem = {
            id: finalChatHistoryId,
            title: question.substring(0, 50),
            timestamp: new Date().toISOString(),
            type: "agent",
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
          console.error(
            `[DirectDayOne] Error saving ${agentType} agent chat history to localStorage:`,
            err
          );
        }
      }

      dispatch(chatAction.newChatHandler());

      return {
        success: true,
        streamingComplete: true,
        data: {
          chatHistoryId: finalChatHistoryId,
        },
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

      dispatch(chatAction.newChatHandler());

      return {
        success: false,
        streamingComplete: true,
        error: error.message,
      };
    } finally {
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));
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
