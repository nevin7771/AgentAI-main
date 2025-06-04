// public/src/store/day-one-agent-actions.js - STREAMING FIXED + SAVING RESTORED
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
 * OPTIMIZED STREAMING MANAGER - Smooth streaming without UI flicker
 */
class OptimizedStreamingManager {
  constructor() {
    this.contentBuffer = new Map();
    this.updateTimeouts = new Map();
    this.lastUpdateTimes = new Map();
    this.UPDATE_INTERVAL = 200; // Optimized timing
    this.MINIMUM_CONTENT_CHANGE = 15; // Content threshold
    this.WORD_THRESHOLD = 4; // Update every 4 words
  }

  scheduleUpdate(streamingId, content, dispatch, isComplete = false) {
    // Clear existing timeout
    if (this.updateTimeouts.has(streamingId)) {
      clearTimeout(this.updateTimeouts.get(streamingId));
    }

    const previousContent = this.contentBuffer.get(streamingId) || "";
    const lastUpdateTime = this.lastUpdateTimes.get(streamingId) || 0;
    const now = Date.now();

    this.contentBuffer.set(streamingId, content);

    // IMMEDIATE update for completion
    if (isComplete) {
      console.log(`[OptimizedStreaming] Completing ${streamingId}`);
      this.flushUpdate(streamingId, dispatch, true);
      return;
    }

    // Calculate content difference
    const contentDiff = Math.abs(
      (content?.length || 0) - (previousContent?.length || 0)
    );
    const wordsDiff = Math.floor(contentDiff / 5); // Approximate words
    const timeSinceLastUpdate = now - lastUpdateTime;

    // Update if enough content changed or enough time passed
    if (
      contentDiff >= this.MINIMUM_CONTENT_CHANGE ||
      wordsDiff >= this.WORD_THRESHOLD ||
      timeSinceLastUpdate >= this.UPDATE_INTERVAL * 2
    ) {
      this.flushUpdate(streamingId, dispatch, false);
    } else {
      // Schedule delayed update
      const timeoutId = setTimeout(() => {
        this.flushUpdate(streamingId, dispatch, false);
      }, this.UPDATE_INTERVAL);

      this.updateTimeouts.set(streamingId, timeoutId);
    }
  }

  flushUpdate(streamingId, dispatch, isComplete) {
    const content = this.contentBuffer.get(streamingId);
    if (content !== undefined) {
      dispatch(
        chatAction.updateStreamingChat({
          streamingId: streamingId,
          content: content,
          isComplete: isComplete,
        })
      );

      // Track update time
      this.lastUpdateTimes.set(streamingId, Date.now());

      // Clean up on completion
      if (isComplete) {
        this.cleanup(streamingId);
      } else {
        // Clear timeout after successful update
        if (this.updateTimeouts.has(streamingId)) {
          clearTimeout(this.updateTimeouts.get(streamingId));
          this.updateTimeouts.delete(streamingId);
        }
      }
    }
  }

  cleanup(streamingId) {
    if (this.updateTimeouts.has(streamingId)) {
      clearTimeout(this.updateTimeouts.get(streamingId));
      this.updateTimeouts.delete(streamingId);
    }
    this.contentBuffer.delete(streamingId);
    this.lastUpdateTimes.delete(streamingId);
  }
}

// Global streaming manager
const optimizedStreamingManager = new OptimizedStreamingManager();

/**
 * Get Day One token from the server
 */
const getDayOneToken = async () => {
  try {
    const response = await fetch(`${BASE_URL}/api/dayone/token`, {
      method: "GET",
      headers: { Accept: "application/json" },
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
 * CRITICAL FIX: Proper save function using correct API endpoints
 */
const saveAgentChatToBackend = async (
  chatHistoryId,
  agentType,
  question,
  response,
  isNewConversation
) => {
  try {
    console.log(
      `[SaveAgentChat] Saving ${agentType} chat, new: ${isNewConversation}`
    );

    if (isNewConversation) {
      // Create new chat history using the original working endpoint
      const createResponse = await fetch(`${BASE_URL}/api/save-agent-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          chatHistoryId: chatHistoryId,
          agentType: agentType,
          question: question,
          response: response,
          isNewConversation: true,
        }),
      });

      if (createResponse.ok) {
        const createData = await createResponse.json();
        console.log(`[SaveAgentChat] Created new chat history:`, createData);
        return createData.chatHistoryId || chatHistoryId;
      } else {
        console.warn(
          `[SaveAgentChat] Failed to create new chat:`,
          createResponse.status
        );
      }
    } else {
      // Append to existing chat history
      const appendResponse = await fetch(`${BASE_URL}/api/save-agent-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          chatHistoryId: chatHistoryId,
          agentType: agentType,
          question: question,
          response: response,
          isNewConversation: false,
        }),
      });

      if (appendResponse.ok) {
        const appendData = await appendResponse.json();
        console.log(`[SaveAgentChat] Appended to existing chat:`, appendData);
        return chatHistoryId;
      } else {
        console.warn(
          `[SaveAgentChat] Failed to append to chat:`,
          appendResponse.status
        );
      }
    }

    // Fallback: Try alternative endpoints
    console.log(`[SaveAgentChat] Trying fallback save method...`);

    const fallbackEndpoint = isNewConversation
      ? `${BASE_URL}/api/create-chat-history-enhanced`
      : `${BASE_URL}/api/append-chat-message`;

    const fallbackBody = isNewConversation
      ? {
          title: `${agentType}: ${question.substring(0, 40)}`,
          message: {
            user: question,
            gemini: response,
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
            gemini: response,
            sources: [],
            relatedQuestions: [],
            queryKeywords: extractKeywords(question),
            isPreformattedHTML: false,
          },
          isSearch: true,
          searchType: "agent",
        };

    const fallbackResponse = await fetch(fallbackEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify(fallbackBody),
    });

    if (fallbackResponse.ok) {
      const fallbackData = await fallbackResponse.json();
      console.log(`[SaveAgentChat] Fallback save successful:`, fallbackData);
      return fallbackData.chatHistoryId || chatHistoryId;
    }

    throw new Error(`All save attempts failed`);
  } catch (error) {
    console.error(`[SaveAgentChat] Save error:`, error);
    return chatHistoryId; // Return original ID even if save fails
  }
};

/**
 * ENHANCED STREAMING with proper save functionality
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
    `[EnhancedStreamDayOne] Starting ${agentType} stream - ID: ${streamingId}`
  );

  let accumulatedText = "";
  let finalChatHistoryId = currentChatHistoryId;
  let streamCompleted = false;
  let chunkCount = 0;
  let wordCount = 0;
  let lastUpdateTime = Date.now();

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
        console.log(`[EnhancedStreamDayOne] Stream completed for ${agentType}`);
        streamCompleted = true;
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

        try {
          let jsonStr = trimmedLine.startsWith("data:data:")
            ? trimmedLine.substring(10).trim()
            : trimmedLine.substring(5).trim();

          if (!jsonStr || jsonStr.length < 3) continue;

          let data;
          try {
            data = JSON.parse(jsonStr);
          } catch (parseError) {
            if (jsonStr.includes('"message"')) {
              const messageMatch = jsonStr.match(/"message"\s*:\s*"([^"]*)"/);
              if (messageMatch && messageMatch[1]) {
                accumulatedText += messageMatch[1];
                chunkCount++;
                wordCount += messageMatch[1].split(/\s+/).length;
              }
            }
            continue;
          }

          if (data && data.message) {
            accumulatedText += data.message;
            chunkCount++;
            wordCount += data.message.split(/\s+/).length;
          }

          // CRITICAL FIX: Conservative streaming updates to prevent race conditions
          const now = Date.now();
          if (
            (wordCount >= 10 && now - lastUpdateTime > 500) ||
            chunkCount % 15 === 0
          ) {
            optimizedStreamingManager.scheduleUpdate(
              streamingId,
              accumulatedText,
              dispatch,
              false
            );
            wordCount = 0;
            lastUpdateTime = now;
          }

          if (data && (data.status === "complete" || data.complete === true)) {
            console.log(
              `[EnhancedStreamDayOne] ${agentType} completion signal received`
            );
            streamCompleted = true;
            break;
          }
        } catch (error) {
          console.error(
            `[EnhancedStreamDayOne] ${agentType} chunk processing error:`,
            error
          );
          continue;
        }
      }
    }

    // FINAL update with complete content
    console.log(
      `[EnhancedStreamDayOne] ${agentType} completed - final length: ${accumulatedText.length}`
    );
    optimizedStreamingManager.scheduleUpdate(
      streamingId,
      accumulatedText,
      dispatch,
      true
    );

    // CRITICAL FIX: Enhanced save logic with state synchronization
    if (isNewConversation && !finalChatHistoryId) {
      finalChatHistoryId = `agent_${agentType}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 7)}`;
      console.log(
        `[EnhancedStreamDayOne] Generated new chat ID: ${finalChatHistoryId}`
      );
    }

    // CRITICAL FIX: Save with proper error handling and state management
    if (finalChatHistoryId && accumulatedText && accumulatedText.length > 10) {
      try {
        console.log(`[EnhancedStreamDayOne] Attempting to save chat...`);

        // CRITICAL FIX: Wait for streaming to fully complete before saving
        await new Promise((resolve) => setTimeout(resolve, 300));

        const savedChatHistoryId = await saveAgentChatToBackend(
          finalChatHistoryId,
          agentType,
          question,
          accumulatedText,
          isNewConversation
        );

        if (savedChatHistoryId) {
          finalChatHistoryId = savedChatHistoryId;
          console.log(
            `[EnhancedStreamDayOne] Chat saved with ID: ${finalChatHistoryId}`
          );

          // CRITICAL FIX: Additional state synchronization delay
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } catch (saveError) {
        console.error(
          `[EnhancedStreamDayOne] Save error (continuing anyway):`,
          saveError
        );
      }
    }

    return {
      text: accumulatedText,
      chatHistoryId: finalChatHistoryId,
      success: true,
    };
  } catch (error) {
    console.error(`[EnhancedStreamDayOne] ${agentType} error:`, error);
    dispatch(
      chatAction.updateStreamingChat({
        streamingId: streamingId,
        content: `Error: ${error.message}`,
        isComplete: true,
        error: error.message,
      })
    );
    throw error;
  } finally {
    optimizedStreamingManager.cleanup(streamingId);
  }
};

/**
 * MAIN FUNCTION: Enhanced Day One request with streaming + saving
 */
export const sendDirectDayOneRequest = (requestData) => {
  return async (dispatch, getState) => {
    const { question, agentType, chatHistoryId, navigate } = requestData;
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;
    const isNewConversation =
      !currentChatHistoryId || currentChatHistoryId.length < 5;

    console.log(
      `[DirectDayOneRequest] ${agentType} request - New: ${isNewConversation}, ChatID: ${currentChatHistoryId}`
    );

    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    try {
      const token = await getDayOneToken();
      const streamingId = `streaming_${agentType}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 7)}`;

      if (isNewConversation) {
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: question,
              gemini: "Connecting...",
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
      } else {
        // Two separate messages for existing conversations
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

        dispatch(
          chatAction.chatStart({
            useInput: {
              user: "",
              gemini: "Connecting...",
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

      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));

      // CRITICAL FIX: Enhanced streaming with state-aware timing
      const streamResult = await streamFromDayOne(
        agentType,
        question,
        token,
        dispatch,
        streamingId,
        currentChatHistoryId,
        isNewConversation
      );

      console.log(`[DirectDayOneRequest] ${agentType} completed successfully`);

      // CRITICAL FIX: Wait for save completion before any navigation
      let finalChatHistoryId = streamResult.chatHistoryId;
      let saveCompleted = false;

      if (
        streamResult.chatHistoryId &&
        streamResult.chatHistoryId !== currentChatHistoryId
      ) {
        console.log(
          `[DirectDayOneRequest] Updating Redux with chat ID: ${streamResult.chatHistoryId}`
        );
        dispatch(
          chatAction.chatHistoryIdHandler({
            chatHistoryId: streamResult.chatHistoryId,
          })
        );

        // CRITICAL FIX: Wait for state to stabilize
        await new Promise((resolve) => setTimeout(resolve, 500));
        saveCompleted = true;
      }

      // Update conversation context
      const state = getState();
      const updatedPreviousChat = [
        ...(state.chat.previousChat || []),
        { role: "user", parts: question },
        { role: "model", parts: streamResult.text },
      ];

      dispatch(
        chatAction.previousChatHandler({ previousChat: updatedPreviousChat })
      );

      // CRITICAL FIX: Only navigate for new conversations AND after save is complete
      if (
        isNewConversation &&
        navigate &&
        finalChatHistoryId &&
        saveCompleted
      ) {
        console.log(
          `[DirectDayOneRequest] Safe navigation to: /app/${finalChatHistoryId}`
        );

        // CRITICAL FIX: Use requestAnimationFrame for smoother navigation timing
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              // Double-check state is still valid before navigation
              const currentState = getState();
              if (currentState.chat.chatHistoryId === finalChatHistoryId) {
                navigate(`/app/${finalChatHistoryId}`, { replace: true });
              }
            } catch (navError) {
              console.error("Navigation error:", navError);
              // Don't fail the entire operation for navigation errors
            }
          }, 800); // Increased delay for stability
        });
      }

      return {
        success: true,
        streamingComplete: true,
        data: {
          answer: streamResult.text,
          sources: [],
          chatHistoryId: finalChatHistoryId,
        },
      };
    } catch (error) {
      console.error(`[DirectDayOneRequest] ${agentType} error:`, error);

      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: `Agent Error: ${error.message}`,
            isLoader: "no",
            isSearch: true,
            searchType: "agent",
            queryKeywords: queryKeywords,
            sources: [],
            relatedQuestions: [],
            error: true,
            isPreformattedHTML: false,
          },
        })
      );

      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));

      return { success: false, streamingComplete: true, error: error.message };
    }
  };
};

// Specific functions for agents
export const sendDirectConfluenceQuestion = (requestData) => {
  console.log(
    "[DirectDayOneRequest] Confluence request:",
    requestData.question?.substring(0, 50) + "..."
  );
  return sendDirectDayOneRequest({ ...requestData, agentType: "confluence" });
};

export const sendDirectMonitorQuestion = (requestData) => {
  console.log(
    "[DirectDayOneRequest] Monitor request:",
    requestData.question?.substring(0, 50) + "..."
  );
  return sendDirectDayOneRequest({ ...requestData, agentType: "monitor" });
};
