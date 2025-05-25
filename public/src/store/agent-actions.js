// public/src/store/agent-actions.js - CORRECTED VERSION
import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";

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

export const fetchAvailableAgents = () => {
  return async (dispatch) => {
    dispatch(agentAction.setLoading(true));

    try {
      const response = await fetch("/api/available-agents", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.agents) {
          dispatch(agentAction.setAgents(data.agents));
          return data.agents;
        }
      }

      // Fallback agents
      const fallbackAgents = [
        {
          id: "client_agent",
          name: "Client Agent",
          description: "Client-related questions",
        },
        { id: "zr_ag", name: "ZR Agent", description: "Zoom Room questions" },
        {
          id: "jira_ag",
          name: "Jira Agent",
          description: "Jira tickets and issues",
        },
        {
          id: "conf_ag",
          name: "Confluence Agent",
          description: "Knowledge base search",
        },
        { id: "zp_ag", name: "ZP Agent", description: "Zoom Phone support" },
        {
          id: "monitor_ag",
          name: "Monitor Agent",
          description: "Monitor log analysis",
        },
        {
          id: "dayone_ag",
          name: "Day One Agent",
          description: "Day One support",
        },
      ];

      dispatch(agentAction.setAgents(fallbackAgents));
      return fallbackAgents;
    } catch (error) {
      console.error("Error fetching agents:", error);
      dispatch(agentAction.setError(error.message));
      return [];
    } finally {
      dispatch(agentAction.setLoading(false));
    }
  };
};

export const sendAgentQuestion = (questionData) => {
  return async (dispatch, getState) => {
    const { question, agents, chatHistoryId, navigate } = questionData;
    const selectedAgent = agents && agents.length > 0 ? agents[0] : "default";
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;

    console.log(
      `[sendAgentQuestion] Processing question with agent: ${selectedAgent}`
    );

    // CRITICAL FIX: Route Jira Agent to dedicated handler
    if (selectedAgent === "jira_ag") {
      return dispatch(
        sendJiraAgentQuestion({
          question,
          chatHistoryId: currentChatHistoryId,
          navigate,
        })
      );
    }

    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    // Add loading message to chat
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

    // Navigate to /app for orchestrated agents
    if (navigate && typeof navigate === "function") {
      setTimeout(() => {
        navigate("/app");
      }, 100);
    }

    try {
      // Handle streaming agents (Confluence, Monitor, Day One)
      if (["conf_ag", "monitor_ag", "dayone_ag"].includes(selectedAgent)) {
        let streamingUrl;
        if (selectedAgent === "conf_ag") {
          streamingUrl = `${SERVER_ENDPOINT}/api/confluence-query`;
        } else if (selectedAgent === "monitor_ag") {
          streamingUrl = `${SERVER_ENDPOINT}/api/monitor-query`;
        } else if (selectedAgent === "dayone_ag") {
          streamingUrl = `${SERVER_ENDPOINT}/api/dayone-agent-stream`;
        }

        console.log(
          `[sendAgentQuestion] Using streaming endpoint for ${selectedAgent}: ${streamingUrl}`
        );

        // Get JWT token for streaming agents
        let token;
        try {
          const tokenResponse = await fetch(
            `${SERVER_ENDPOINT}/api/generate-jwt`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentId: selectedAgent }),
            }
          );
          if (tokenResponse.ok) token = (await tokenResponse.json()).token;
        } catch (tokenError) {
          console.warn("Token generation failed:", tokenError);
        }

        const response = await fetch(streamingUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          credentials: "include",
          body: JSON.stringify({
            question,
            chatHistoryId: currentChatHistoryId,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Streaming request failed for ${selectedAgent}: ${response.status} ${errorText}`
          );
        }

        // Handle streaming response (simplified for brevity)
        // ... streaming processing code ...

        dispatch(uiAction.setLoading(false));
        dispatch(agentAction.setLoading(false));

        return {
          success: true,
          orchestrationComplete: true,
        };
      }

      // Handle non-streaming agents (client_agent, zr_ag, zp_ag) - polling based
      console.log(
        `[sendAgentQuestion] Using polling for agent: ${selectedAgent}`
      );

      // Get JWT token
      let token;
      try {
        const tokenResponse = await fetch(
          `${SERVER_ENDPOINT}/api/generate-jwt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: selectedAgent }),
          }
        );

        if (tokenResponse.ok) {
          token = (await tokenResponse.json()).token;
        }
      } catch (tokenError) {
        console.error("Token generation failed:", tokenError);
      }

      const url = `${SERVER_ENDPOINT}/api/agent-question`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        credentials: "include",
        body: JSON.stringify({
          question,
          agentId: selectedAgent,
          chatHistoryId: currentChatHistoryId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Agent request failed: ${response.status} ${errorText}`
        );
      }

      const data = await response.json();
      console.log(`[sendAgentQuestion] Received response:`, data);

      if (data.success && data.taskId) {
        // Start polling for result
        return dispatch(pollAgentResponse(data.taskId, selectedAgent));
      } else {
        throw new Error(data.error || "Failed to start agent task");
      }
    } catch (error) {
      console.error("Error in sendAgentQuestion:", error);

      // Remove loading indicator
      dispatch(chatAction.popChat());

      // Show error message
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: `
              <div class="search-results-container">
                <div class="search-content-wrapper">
                  <div class="search-main-content error">
                    <h3>Agent Error</h3>
                    <p>Sorry, there was an error processing your request: ${error.message}</p>
                  </div>
                </div>
              </div>
            `,
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
        orchestrationComplete: true,
        error: error.message,
      };
    }
  };
};

// NEW: Dedicated Jira Agent handler
export const sendJiraAgentQuestion = (questionData) => {
  return async (dispatch, getState) => {
    const { question, chatHistoryId, navigate } = questionData;
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;

    console.log(`[sendJiraAgentQuestion] Processing Jira query: "${question}"`);

    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    // Add loading message to chat
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

    // Navigate to /app
    if (navigate && typeof navigate === "function") {
      setTimeout(() => {
        navigate("/app");
      }, 100);
    }

    try {
      // Check if it's a direct ticket request
      const ticketPattern = /\b([A-Z]+-\d+)\b/;
      const ticketMatch = question.match(ticketPattern);

      let jiraResponse;

      if (ticketMatch) {
        // Direct ticket summary
        const ticketId = ticketMatch[1];
        console.log(
          `[sendJiraAgentQuestion] Requesting ticket summary: ${ticketId}`
        );

        const response = await fetch(
          `${BASE_URL}/api/jira/ticket/${ticketId}`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            credentials: "include",
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Jira ticket request failed: ${response.status} ${errorText}`
          );
        }

        jiraResponse = await response.json();
      } else {
        // General Jira query
        console.log(`[sendJiraAgentQuestion] Processing general query`);

        const response = await fetch(`${BASE_URL}/api/jira/query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            query: question,
            chatHistory: [], // Could include previous context if needed
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Jira query request failed: ${response.status} ${errorText}`
          );
        }

        jiraResponse = await response.json();
      }

      console.log(`[sendJiraAgentQuestion] Received Jira response:`, {
        success: jiraResponse.success,
        hasFormattedResponse: !!jiraResponse.formattedResponse,
        sourcesCount: jiraResponse.sources?.length || 0,
        hasResult: !!jiraResponse.result,
      });

      // Remove loading message
      dispatch(chatAction.popChat());

      if (!jiraResponse.success) {
        throw new Error(
          jiraResponse.error || jiraResponse.message || "Jira query failed"
        );
      }

      // Extract response content
      const responseContent =
        jiraResponse.formattedResponse ||
        jiraResponse.result?.answer ||
        "No response content available";

      const sources =
        jiraResponse.sources || jiraResponse.result?.sources || [];
      const relatedQuestions =
        jiraResponse.relatedQuestions ||
        jiraResponse.result?.relatedQuestions ||
        [];

      // Add successful response to chat
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: responseContent,
            isLoader: "no",
            isSearch: true,
            searchType: "agent",
            queryKeywords: queryKeywords,
            sources: sources,
            relatedQuestions: relatedQuestions,
            isPreformattedHTML: true, // Jira responses are typically pre-formatted
          },
        })
      );

      // Handle chat history
      let finalChatHistoryId = currentChatHistoryId;
      if (!finalChatHistoryId) {
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
                gemini: responseContent,
                sources: sources,
                relatedQuestions: relatedQuestions,
                queryKeywords,
                isPreformattedHTML: true,
              },
              isSearch: true,
              searchType: "agent",
            }),
          });

          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            if (historyData.success && historyData.chatHistoryId) {
              finalChatHistoryId = historyData.chatHistoryId;
            }
          }
        } catch (historyError) {
          console.error("Error creating chat history:", historyError);
        }
      }

      if (finalChatHistoryId) {
        dispatch(
          chatAction.chatHistoryIdHandler({
            chatHistoryId: finalChatHistoryId,
          })
        );

        // Navigate to final chat
        if (navigate && typeof navigate === "function") {
          setTimeout(() => {
            navigate(`/app/${finalChatHistoryId}`, { replace: true });
          }, 500);
        }
      }

      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));

      return {
        success: true,
        orchestrationComplete: true,
        data: {
          answer: responseContent,
          sources: sources,
          chatHistoryId: finalChatHistoryId,
        },
      };
    } catch (error) {
      console.error("Error in sendJiraAgentQuestion:", error);

      // Remove loading indicator
      dispatch(chatAction.popChat());

      // Show error message
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: `
              <div class="search-results-container">
                <div class="search-content-wrapper">
                  <div class="search-main-content error">
                    <h3>Jira Agent Error</h3>
                    <p>Sorry, there was an error processing your Jira request: ${error.message}</p>
                  </div>
                </div>
              </div>
            `,
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
        orchestrationComplete: true,
        error: error.message,
      };
    }
  };
};

// Polling function for non-streaming agents
export const pollAgentResponse = (taskId, agentId) => {
  return async (dispatch, getState) => {
    const loadingChatEntry = getState().chat.chats.find(
      (c) => c.isLoader === "yes" && c.searchType === "agent"
    );
    const originalQuestion = loadingChatEntry?.user || `Agent Task: ${taskId}`;
    const queryKeywords = extractKeywords(originalQuestion);

    try {
      let token;
      try {
        const tokenResponse = await fetch(
          `${SERVER_ENDPOINT}/api/generate-jwt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: agentId || "default" }),
          }
        );
        if (tokenResponse.ok) token = (await tokenResponse.json()).token;
      } catch (tokenError) {
        console.error("Failed to generate token for polling:", tokenError);
      }

      const url = `${SERVER_ENDPOINT}/api/proxy-agent-poll`;
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ taskId, agentId }),
      });

      if (!response.ok) {
        throw new Error(
          `Agent poll failed: ${response.status} ${await response.text()}`
        );
      }

      const data = await response.json();

      if (data.status === "complete") {
        dispatch(chatAction.popChat());

        let geminiContent = "";
        let sourcesData = [];
        let relatedQuestionsData = [];

        if (
          data.result &&
          typeof data.result === "object" &&
          data.result.answer
        ) {
          geminiContent = data.result.answer;
          sourcesData = data.result.sources || [];
          relatedQuestionsData = data.result.relatedQuestions || [];
        } else if (
          typeof data.result === "string" &&
          data.result.trim() !== ""
        ) {
          geminiContent = data.result;
        } else {
          geminiContent =
            "Agent completed the request, but no response content was found.";
        }

        dispatch(
          chatAction.chatStart({
            useInput: {
              user: data.question || originalQuestion,
              gemini: geminiContent,
              sources: sourcesData,
              relatedQuestions: relatedQuestionsData,
              queryKeywords: queryKeywords,
              isLoader: "no",
              isSearch: true,
              searchType: "agent",
              isPreformattedHTML: true,
            },
          })
        );

        dispatch(agentAction.clearActiveTask());
        dispatch(uiAction.setLoading(false));
        dispatch(agentAction.setLoading(false));

        return { success: true, data, status: "complete" };
      } else if (data.status === "error") {
        dispatch(chatAction.popChat());
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: originalQuestion,
              gemini: `<p>Agent Error: ${
                data.error || "Unknown error during polling"
              }</p>`,
              isLoader: "no",
              isSearch: true,
              searchType: "agent",
              error: true,
              queryKeywords: queryKeywords,
              sources: [],
              relatedQuestions: [],
              isPreformattedHTML: true,
            },
          })
        );
        dispatch(agentAction.clearActiveTask());
        dispatch(uiAction.setLoading(false));
        dispatch(agentAction.setLoading(false));
        return { success: false, error: data.error, status: "error" };
      } else {
        return { success: false, status: data.status || "processing" };
      }
    } catch (error) {
      console.error("Error in pollAgentResponse:", error);
      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: originalQuestion,
            gemini: `<p>Polling Error: ${error.message}</p>`,
            isLoader: "no",
            isSearch: true,
            searchType: "agent",
            error: true,
            queryKeywords: queryKeywords,
            sources: [],
            relatedQuestions: [],
            isPreformattedHTML: true,
          },
        })
      );
      dispatch(agentAction.clearActiveTask());
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));
      return { success: false, error: error.message, status: "error" };
    }
  };
};
