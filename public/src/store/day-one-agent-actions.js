// public/src/store/day-one-agent-actions.js - FIXED VERSION WITH PROPER TIMING
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
 * Get Day One token from the server
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
 * CRITICAL FIX: Enhanced conversation saving with retry logic
 */
const saveConversationToMongoDB = async (
  chatHistoryId,
  question,
  answer,
  isNewConversation,
  maxRetries = 3
) => {
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const endpoint = isNewConversation
        ? `${BASE_URL}/api/create-chat-history-enhanced`
        : `${BASE_URL}/api/append-chat-message`;

      const method = "POST";

      console.log(
        `[SaveConversation] ${
          isNewConversation ? "Creating" : "Appending"
        } conversation (attempt ${retryCount + 1}): ${chatHistoryId}`
      );

      const body = isNewConversation
        ? {
            title: `Agent: ${question.substring(0, 40)}`,
            message: {
              user: question,
              gemini: answer,
              sources: [],
              relatedQuestions: [],
              queryKeywords: extractKeywords(question),
              isPreformattedHTML: false,
            },
            isSearch: true,
            searchType: "agent",
            clientId: chatHistoryId,
          }
        : {
            chatHistoryId: chatHistoryId,
            message: {
              user: question,
              gemini: answer,
              sources: [],
              relatedQuestions: [],
              queryKeywords: extractKeywords(question),
              isPreformattedHTML: false,
            },
            isSearch: true,
            searchType: "agent",
          };

      const response = await fetch(endpoint, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(
          `[SaveConversation] Success (attempt ${retryCount + 1}):`,
          result
        );

        const finalChatHistoryId = result.chatHistoryId || chatHistoryId;

        // CRITICAL FIX: Wait for MongoDB consistency
        if (isNewConversation) {
          console.log(`[SaveConversation] Waiting for MongoDB consistency...`);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second wait
        }

        return finalChatHistoryId;
      } else {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error(
        `[SaveConversation] Error (attempt ${retryCount + 1}):`,
        error
      );

      retryCount++;

      if (retryCount < maxRetries) {
        console.log(`[SaveConversation] Retrying in ${retryCount * 1000}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryCount * 1000));
      } else {
        console.error(`[SaveConversation] Max retries exceeded`);
        return chatHistoryId; // Return original ID on failure
      }
    }
  }

  return chatHistoryId;
};

/**
 * CRITICAL FIX: Enhanced streaming with better error handling
 */
const streamFromDayOne = async (
  agentType,
  question,
  token,
  dispatch,
  streamingId,
  currentChatHistoryId,
  isNewConversation
) => {
  const functionId = FUNCTION_IDS[agentType];
  if (!functionId) {
    throw new Error(`Invalid agent type: ${agentType}`);
  }

  console.log(
    `[StreamDayOne] Starting ${agentType} stream - New: ${isNewConversation}, ChatID: ${currentChatHistoryId}`
  );

  let accumulatedText = "";
  let finalChatHistoryId = currentChatHistoryId;
  let streamCompleted = false;

  try {
    const response = await fetch(DAY_ONE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        functionId: functionId,
        question: question,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!streamCompleted) {
      const { done, value } = await reader.read();

      if (done) {
        console.log("[StreamDayOne] Stream reader done");
        streamCompleted = true;
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process complete lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

        try {
          let jsonStr = trimmedLine.startsWith("data:data:")
            ? trimmedLine.substring(10).trim()
            : trimmedLine.substring(5).trim();

          // Skip empty or incomplete JSON
          if (!jsonStr || jsonStr.length < 3) continue;

          let data;
          try {
            data = JSON.parse(jsonStr);
          } catch (parseError) {
            // Try to extract message from partial JSON
            if (jsonStr.includes('"message"')) {
              const messageMatch = jsonStr.match(/"message"\s*:\s*"([^"]*)"/);
              if (messageMatch && messageMatch[1]) {
                accumulatedText += messageMatch[1];

                // Update UI with partial content - PREVENT PAGE REFRESH
                dispatch(
                  chatAction.updateStreamingChat({
                    streamingId: streamingId,
                    content: accumulatedText,
                    isComplete: false,
                  })
                );
              }
            }
            continue;
          }

          // Process valid JSON data
          if (data && data.message) {
            accumulatedText += data.message;

            // Update UI with streamed content - PREVENT PAGE REFRESH
            dispatch(
              chatAction.updateStreamingChat({
                streamingId: streamingId,
                content: accumulatedText,
                isComplete: false,
              })
            );
          }

          // Check for completion
          if (data && (data.status === "complete" || data.complete === true)) {
            console.log("[StreamDayOne] Received completion signal");
            streamCompleted = true;
            break;
          }
        } catch (error) {
          console.error("[StreamDayOne] Error processing chunk:", error);
          continue;
        }
      }
    }

    // Mark streaming as complete - PREVENT PAGE REFRESH
    dispatch(
      chatAction.updateStreamingChat({
        streamingId: streamingId,
        content: accumulatedText,
        isComplete: true,
      })
    );

    // CRITICAL FIX: Generate proper chat history ID for new conversations
    if (isNewConversation) {
      if (!finalChatHistoryId) {
        finalChatHistoryId = `agent_${agentType}_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 7)}`;
      }
    }

    // CRITICAL FIX: Save to MongoDB with enhanced error handling
    console.log(`[StreamDayOne] Saving conversation to MongoDB...`);
    finalChatHistoryId = await saveConversationToMongoDB(
      finalChatHistoryId,
      question,
      accumulatedText,
      isNewConversation
    );

    console.log(
      `[StreamDayOne] Conversation saved with ID: ${finalChatHistoryId}`
    );

    return {
      text: accumulatedText,
      chatHistoryId: finalChatHistoryId,
      success: true,
    };
  } catch (error) {
    console.error("[StreamDayOne] Error:", error);

    // Update UI with error - PREVENT PAGE REFRESH
    dispatch(
      chatAction.updateStreamingChat({
        streamingId: streamingId,
        content: `<p><strong>Error:</strong> ${error.message}</p>`,
        isComplete: true,
        error: error.message,
      })
    );

    throw error;
  }
};

/**
 * CRITICAL FIX: Enhanced verification function to ensure chat exists
 */
const verifyChatExists = async (chatHistoryId, maxAttempts = 5) => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      console.log(
        `[VerifyChat] Checking chat existence (attempt ${
          attempts + 1
        }): ${chatHistoryId}`
      );

      const response = await fetch(`${BASE_URL}/api/chatdata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ chatHistoryId: chatHistoryId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.chats) {
          console.log(
            `[VerifyChat] Chat verified successfully: ${chatHistoryId}`
          );
          return true;
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        console.log(`[VerifyChat] Chat not ready, waiting 1 second...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`[VerifyChat] Error verifying chat:`, error);
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  console.warn(
    `[VerifyChat] Could not verify chat after ${maxAttempts} attempts`
  );
  return false;
};

/**
 * MAIN FUNCTION: Send Day One request with enhanced error handling
 */
export const sendDirectDayOneRequest = (requestData) => {
  return async (dispatch, getState) => {
    const { question, agentType, chatHistoryId, navigate } = requestData;
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;
    const isNewConversation =
      !currentChatHistoryId || currentChatHistoryId.length < 5;

    console.log(
      `[DirectDayOne] Processing ${agentType} - New: ${isNewConversation}, ChatID: ${currentChatHistoryId}`
    );

    // Set loading state
    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    try {
      // Get token from server
      const token = await getDayOneToken();

      // Generate streaming ID
      let streamingId = `streaming_${agentType}_${Date.now()}_${Math.random()
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

        // Replace with streaming message after short delay
        setTimeout(() => {
          dispatch(chatAction.popChat());
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: question,
                gemini: `Connecting to ${agentType.toUpperCase()} Agent...`,
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
              gemini: `Connecting to ${agentType.toUpperCase()} Agent...`,
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
      const streamResult = await streamFromDayOne(
        agentType,
        question,
        token,
        dispatch,
        streamingId,
        currentChatHistoryId,
        isNewConversation
      );

      // Update chat history ID in Redux
      dispatch(
        chatAction.chatHistoryIdHandler({
          chatHistoryId: streamResult.chatHistoryId,
        })
      );

      // Update previous chat context for conversation continuation
      const state = getState();
      const updatedPreviousChat = [
        ...(state.chat.previousChat || []),
        { role: "user", parts: question },
        { role: "model", parts: streamResult.text },
      ];

      dispatch(
        chatAction.previousChatHandler({
          previousChat: updatedPreviousChat,
        })
      );

      // CRITICAL FIX: Enhanced navigation with verification for new conversations
      if (isNewConversation && navigate && streamResult.chatHistoryId) {
        console.log(`[DirectDayOne] Verifying chat before navigation...`);

        // Verify chat exists before navigating
        const chatExists = await verifyChatExists(streamResult.chatHistoryId);

        if (chatExists) {
          console.log(
            `[DirectDayOne] Chat verified, navigating to: /app/${streamResult.chatHistoryId}`
          );
          // Delay navigation to ensure UI is stable
          setTimeout(() => {
            navigate(`/app/${streamResult.chatHistoryId}`, { replace: true });
          }, 500); // Reduced delay but still safe
        } else {
          console.warn(
            `[DirectDayOne] Chat verification failed, staying on current page`
          );
          // Still update the URL without full navigation to avoid losing the conversation
          window.history.replaceState(
            {},
            "",
            `/app/${streamResult.chatHistoryId}`
          );
        }
      }

      // Save to localStorage for recent chats
      if (isNewConversation) {
        try {
          const existingHistory = JSON.parse(
            localStorage.getItem("searchHistory") || "[]"
          );
          const historyItem = {
            id: streamResult.chatHistoryId,
            title: `${agentType.toUpperCase()}: ${question.substring(0, 40)}`,
            timestamp: new Date().toISOString(),
            type: "agent",
            agentType: agentType,
          };

          if (
            !existingHistory.some(
              (item) => item.id === streamResult.chatHistoryId
            )
          ) {
            existingHistory.unshift(historyItem);
            localStorage.setItem(
              "searchHistory",
              JSON.stringify(existingHistory.slice(0, 50))
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
          sources: [],
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
    "[DirectDayOne] Sending Confluence agent question:",
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
    "[DirectDayOne] Sending Monitor agent question:",
    requestData.question
  );
  return sendDirectDayOneRequest({
    ...requestData,
    agentType: "monitor",
  });
};
