// public/src/store/agent-actions.js - Fixed version
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

    // Check for Jira ticket patterns
    if (selectedAgent === "jira_ag") {
      const jiraTicketPattern = /\b([A-Z]+-\d+)\b/;
      const summarizePattern =
        /(?:summarize|describe|details|about|get|fetch|show|find)\s+(?:jira|ticket|issue)?\s+(?:number|id|key|#)?\s*([A-Z]+-\d+)/i;

      const matches = [
        question.match(summarizePattern),
        question.match(jiraTicketPattern),
      ].filter(Boolean);

      if (matches.length > 0) {
        const ticketId = matches[0][1];
        if (ticketId) {
          console.log(`[sendAgentQuestion] Detected Jira ticket ${ticketId}`);
          return dispatch(getJiraTicketSummary(ticketId, question));
        }
      }
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

        if (!tokenResponse.ok) {
          throw new Error(
            `Token generation failed: ${
              tokenResponse.status
            } ${await tokenResponse.text()}`
          );
        }
        token = (await tokenResponse.json()).token;
      } catch (tokenError) {
        console.error("Token generation failed:", tokenError);
        throw new Error(`Token generation failed: ${tokenError.message}`);
      }

      // Handle streaming agents (Confluence, Monitor, Day One)
      if (["conf_ag", "monitor", "dayone"].includes(selectedAgent)) {
        let streamingUrl;
        if (selectedAgent === "conf_ag") {
          streamingUrl = `${SERVER_ENDPOINT}/api/confluence-query`;
        } else if (selectedAgent === "monitor") {
          streamingUrl = `${SERVER_ENDPOINT}/api/monitor-query`;
        } else if (selectedAgent === "dayone") {
          streamingUrl = `${SERVER_ENDPOINT}/api/dayone-agent-stream`;
        }

        try {
          console.log(
            `[sendAgentQuestion] Using streaming endpoint for ${selectedAgent}: ${streamingUrl}`
          );

          const response = await fetch(streamingUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              Authorization: `Bearer ${token}`,
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

          // Process streaming response
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let fullResponse = "";
          let sources = [];
          let finalAnswer = "";
          let buffer = "";
          let streamComplete = false;
          let finalChatHistoryId = currentChatHistoryId;

          const formatPartialResponse = (text, agentType) => {
            const formattedText = text
              .split("\n\n")
              .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
              .join("");

            let title = "Agent Results";
            if (agentType === "conf_ag") title = "Confluence Results";
            else if (agentType === "monitor") title = "Monitor Results";
            else if (agentType === "dayone") title = "Day One Results";

            return `
              <div class="search-results-container">
                <div class="search-content-wrapper">
                  <div class="search-main-content">
                    <h2>${title}</h2>
                    <div class="search-answer">
                      ${formattedText}
                    </div>
                  </div>
                </div>
              </div>
            `;
          };

          while (!streamComplete) {
            try {
              const { value, done } = await reader.read();

              if (done) {
                streamComplete = true;
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              let eventEnd = 0;
              while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
                const event = buffer.substring(0, eventEnd);
                buffer = buffer.substring(eventEnd + 2);

                if (event.startsWith("data:")) {
                  const jsonStr = event.slice(5).trim();
                  try {
                    const data = JSON.parse(jsonStr);
                    console.log(
                      `[${selectedAgent}] Received event:`,
                      data.type
                    );

                    if (data.type === "progress") {
                      if (data.text || data.content || data.message) {
                        const newContent =
                          data.text || data.content || data.message || "";

                        if (newContent.length > fullResponse.length) {
                          fullResponse = newContent;
                        }

                        if (newContent.length > 0) {
                          dispatch(chatAction.popChat());
                          dispatch(
                            chatAction.chatStart({
                              useInput: {
                                user: question,
                                gemini: formatPartialResponse(
                                  fullResponse,
                                  selectedAgent
                                ),
                                isLoader: "partial",
                                isSearch: true,
                                searchType: "agent",
                                queryKeywords: queryKeywords,
                                isPreformattedHTML: true,
                              },
                            })
                          );
                        }
                      }
                    } else if (data.type === "complete") {
                      streamComplete = true;
                      finalAnswer =
                        data.text ||
                        data.result?.answer ||
                        data.content ||
                        fullResponse;
                      sources = data.sources || data.result?.sources || [];

                      if (data.chatHistoryId) {
                        finalChatHistoryId = data.chatHistoryId;
                      }

                      const formattedHtml =
                        data.html ||
                        data.formattedHtml ||
                        formatPartialResponse(finalAnswer, selectedAgent);

                      dispatch(chatAction.popChat());
                      dispatch(
                        chatAction.chatStart({
                          useInput: {
                            user: question,
                            gemini: formattedHtml,
                            sources: sources,
                            relatedQuestions: [],
                            queryKeywords: queryKeywords,
                            isLoader: "no",
                            isSearch: true,
                            searchType: "agent",
                            isPreformattedHTML: true,
                          },
                        })
                      );

                      break;
                    } else if (data.type === "error") {
                      throw new Error(data.error || "Unknown streaming error");
                    }
                  } catch (parseError) {
                    console.error("Error parsing SSE data:", parseError);
                  }
                }
              }
            } catch (streamError) {
              console.error("Stream processing error:", streamError);
              streamComplete = true;
              break;
            }
          }

          // Handle case where stream ended without complete event
          if (!finalAnswer && fullResponse) {
            finalAnswer = fullResponse;

            dispatch(chatAction.popChat());
            dispatch(
              chatAction.chatStart({
                useInput: {
                  user: question,
                  gemini: formatPartialResponse(finalAnswer, selectedAgent),
                  sources: sources,
                  relatedQuestions: [],
                  queryKeywords: queryKeywords,
                  isLoader: "no",
                  isSearch: true,
                  searchType: "agent",
                  isPreformattedHTML: true,
                },
              })
            );
          }

          // Generate chat history ID if needed
          if (!finalChatHistoryId) {
            finalChatHistoryId = `agent_${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 7)}`;
          }

          // Update chat history ID
          dispatch(
            chatAction.chatHistoryIdHandler({
              chatHistoryId: finalChatHistoryId,
            })
          );

          // Create chat history record
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
                  gemini: finalAnswer,
                  sources: sources,
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
                dispatch(
                  chatAction.chatHistoryIdHandler({
                    chatHistoryId: finalChatHistoryId,
                  })
                );
              }
            }
          } catch (historyError) {
            console.error("Error creating chat history:", historyError);
          }

          // Save to localStorage
          try {
            const existingHistory = JSON.parse(
              localStorage.getItem("searchHistory") || "[]"
            );
            const historyItem = {
              id: finalChatHistoryId,
              title: question.substring(0, 50),
              timestamp: new Date().toISOString(),
              type: "agent",
            };

            if (
              !existingHistory.some((item) => item.id === finalChatHistoryId)
            ) {
              existingHistory.unshift(historyItem);
              localStorage.setItem(
                "searchHistory",
                JSON.stringify(existingHistory.slice(0, 50))
              );
              window.dispatchEvent(new Event("storage"));
            }
          } catch (err) {
            console.error("Error saving to localStorage:", err);
          }

          // Navigate to final chat
          if (navigate && typeof navigate === "function") {
            setTimeout(() => {
              navigate(`/app/${finalChatHistoryId}`, { replace: true });
            }, 500);
          }

          dispatch(chatAction.newChatHandler());
          dispatch(uiAction.setLoading(false));
          dispatch(agentAction.setLoading(false));

          return {
            success: true,
            orchestrationComplete: true,
            data: {
              answer: finalAnswer,
              sources: sources,
              chatHistoryId: finalChatHistoryId,
            },
          };
        } catch (error) {
          console.error(
            `Error in streaming request for ${selectedAgent}:`,
            error
          );
          throw error;
        }
      }

      // Handle non-streaming agents (polling-based)
      console.log(
        `[sendAgentQuestion] Using polling for agent: ${selectedAgent}`
      );

      const url = `${SERVER_ENDPOINT}/api/agent-query`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
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
        dispatch(uiAction.setLoading(false));
        dispatch(agentAction.setLoading(false));

        return {
          success: true,
          taskId: data.taskId,
          agentTasks: data.agentTasks || {
            [selectedAgent]: { taskId: data.taskId },
          },
        };
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

      dispatch(chatAction.newChatHandler());
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

export const getJiraTicketSummary = (ticketId, originalQuery = null) => {
  return async (dispatch, getState) => {
    const queryKeywords = extractKeywords(`Jira ticket ${ticketId}`);
    let currentChatHistoryId = getState().chat.chatHistoryId;

    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    if (!originalQuery) {
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: `Summarize Jira ticket ${ticketId}`,
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
    }

    try {
      let token;
      try {
        const tokenResponse = await fetch(
          `${SERVER_ENDPOINT}/api/generate-jwt`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId: "jira_ag" }),
          }
        );
        if (tokenResponse.ok) token = (await tokenResponse.json()).token;
      } catch (tokenError) {
        console.warn("Token generation failed:", tokenError);
      }

      const ticketUrl = `${SERVER_ENDPOINT}/api/jira/ticket/${ticketId}`;
      console.log(`[getJiraTicketSummary] Fetching ticket ${ticketId}`);

      const response = await fetch(ticketUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch Jira ticket: ${response.status} ${errorText}`
        );
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || "Failed to get ticket summary");
      }

      dispatch(chatAction.popChat());

      dispatch(
        chatAction.chatStart({
          useInput: {
            user: `Summarize Jira ticket ${ticketId}`,
            gemini: data.formattedResponse || data.result.answer,
            sources: data.sources || data.result.sources || [],
            relatedQuestions: data.result?.relatedQuestions || [],
            queryKeywords: queryKeywords,
            isLoader: "no",
            isSearch: true,
            searchType: "agent",
            isPreformattedHTML: false,
          },
        })
      );

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
              title: `Jira Ticket ${ticketId}`,
              message: {
                user: `Summarize Jira ticket ${ticketId}`,
                gemini: data.formattedResponse || data.result.answer,
                sources: data.sources || data.result.sources || [],
                relatedQuestions: data.result?.relatedQuestions || [],
                queryKeywords,
                isPreformattedHTML: false,
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
          console.error("Error creating chat history:", historyError);
        }
      }

      if (finalChatHistoryId) {
        dispatch(
          chatAction.chatHistoryIdHandler({
            chatHistoryId: finalChatHistoryId,
          })
        );
      }

      dispatch(chatAction.newChatHandler());
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));

      return {
        success: true,
        orchestrationComplete: true,
        data: {
          ticket: data.ticket,
          chatHistoryId: finalChatHistoryId,
        },
      };
    } catch (error) {
      console.error("Error fetching Jira ticket:", error);

      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: `Summarize Jira ticket ${ticketId}`,
            gemini: `
              <div class="search-results-container">
                <div class="search-content-wrapper">
                  <div class="search-main-content error">
                    <h3>Jira Ticket Error</h3>
                    <p>${error.message}</p>
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

      dispatch(chatAction.newChatHandler());
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
        } else if (data.answer) {
          geminiContent = data.answer;
          sourcesData = data.sources || [];
          relatedQuestionsData = data.relatedQuestions || [];
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
              isPreformattedHTML: false,
            },
          })
        );

        let finalChatHistoryId = data.chatHistoryId;
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
                title: (data.question || originalQuestion).substring(0, 50),
                message: {
                  user: data.question || originalQuestion,
                  gemini: geminiContent,
                  sources: sourcesData,
                  relatedQuestions: relatedQuestionsData,
                  queryKeywords,
                  isPreformattedHTML: false,
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
            console.error("Error creating chat history:", historyError);
          }
        }

        if (finalChatHistoryId) {
          dispatch(
            chatAction.chatHistoryIdHandler({
              chatHistoryId: finalChatHistoryId,
            })
          );
        }

        dispatch(chatAction.newChatHandler());
        dispatch(agentAction.clearActiveTask());
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
      return { success: false, error: error.message, status: "error" };
    }
  };
};
