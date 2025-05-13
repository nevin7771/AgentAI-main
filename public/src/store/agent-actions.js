// COMPLETE FIX FOR agent-actions.js
// This addresses both polling agent responses and direct API responses

import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";
// import { getRecentChat } from "./chat-action"; // Not strictly needed here if chat history updates are handled by components or other actions

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

const parseFormattedHTML = (htmlString, queryKeywords) => {
  let mainAnswer = htmlString;
  const sources = [];
  const relatedQuestions = [];
  let parsingFailed = false;
  if (typeof DOMParser === "undefined")
    return { mainAnswer, sources, relatedQuestions, parsingFailed: true };
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
        if (title && url) sources.push({ title, url, snippet, favicon });
      });
    doc
      .querySelectorAll(".gemini-chip, .related-questions-section .chip")
      .forEach((el) => {
        const questionText = el.textContent.trim();
        if (questionText) relatedQuestions.push(questionText);
      });
  } catch (e) {
    console.error(
      "Error parsing HTML for structured data in agent-actions:",
      e
    );
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

export const sendAgentQuestion = (questionData) => {
  return async (dispatch, getState) => {
    const { question, agents, chatHistoryId, navigate } = questionData; // Assuming navigate is passed for explicit navigation
    const selectedAgent = agents && agents.length > 0 ? agents[0] : "default";
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;

    dispatch(uiAction.setLoading(true));
    dispatch(agentAction.setLoading(true));

    // Dispatch initial loading message to the chat FIRST, before any API calls
    dispatch(
      chatAction.chatStart({
        useInput: {
          user: question,
          gemini: "",
          isLoader: "yes",
          isSearch: true,
          // Always use agent type for Jira/Confluence
          searchType: "agent",
          queryKeywords: queryKeywords,
          sources: [],
          relatedQuestions: [],
          isPreformattedHTML: false,
        },
      })
    );

    // For orchestrated agents (Jira, Confluence), navigate to /app with a slight delay
    // to ensure the loading message is rendered first
    if (selectedAgent === "jira_ag" || selectedAgent === "conf_ag") {
      setTimeout(() => {
        if (navigate && typeof navigate === "function") {
          navigate("/app");
        }
      }, 100);
    }

    try {
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
        if (!tokenResponse.ok)
          throw new Error(
            `Token generation failed: ${
              tokenResponse.status
            } ${await tokenResponse.text()}`
          );
        token = (await tokenResponse.json()).token;
      } catch (tokenError) {
        console.error("Token generation failed for agent:", tokenError);
        throw new Error(`Token generation failed: ${tokenError.message}`);
      }

      if (selectedAgent === "jira_ag" || selectedAgent === "conf_ag") {
        const dataSource = selectedAgent === "jira_ag" ? "jira" : "confluence";
        const orchestratedQueryUrl = `${SERVER_ENDPOINT}/api/orchestrated-query`;
        const historyToPass = [];

        try {
          const response = await fetch(orchestratedQueryUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(token && { Authorization: `Bearer ${token}` }),
            },
            credentials: "include",
            body: JSON.stringify({
              query: question,
              chatHistory: historyToPass,
              options: { requestedDataSource: dataSource },
              chatHistoryId: currentChatHistoryId,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Orchestrated query failed for ${selectedAgent}: ${response.status} ${errorText}`
            );
          }

          const data = await response.json();
          console.log(`[sendAgentQuestion] Orchestrated query response:`, data);

          // Handle success/failure responses appropriately
          if (!data.success) {
            throw new Error(
              data.error ||
                `Orchestrated query for ${selectedAgent} was not successful.`
            );
          }

          // Remove loading message
          dispatch(chatAction.popChat());

          // FIXED: Extract content from response, supporting multiple formats
          // Prioritize various possible content fields
          let geminiContent;
          let sourcesData = [];
          let relatedQuestionsData = [];
          let isPreformattedHTML = false;

          // Check for different response formats with detailed logging
          if (data.final_answer) {
            // 1. From OrchestrationService: final_answer field
            console.log("[sendAgentQuestion] Using data.final_answer");
            geminiContent = data.final_answer.toString();
            // Try to extract sources from retrieval_contexts
            if (
              data.retrieval_contexts &&
              Array.isArray(data.retrieval_contexts)
            ) {
              sourcesData = data.retrieval_contexts.map((ctx) => ({
                title: ctx.title || "Source",
                url: ctx.url || null,
                snippet: ctx.summary || "",
                favicon: null,
              }));
            }
          } else if (data.result && typeof data.result.answer !== "undefined") {
            // 2. Check for result.answer structure
            console.log("[sendAgentQuestion] Using data.result.answer");
            geminiContent = data.result.answer;
            sourcesData = data.result.sources || [];
            relatedQuestionsData = data.result.relatedQuestions || [];
          } else if (data.answer) {
            // 3. Direct answer field
            console.log("[sendAgentQuestion] Using data.answer");
            geminiContent = data.answer;
            sourcesData = data.sources || [];
            relatedQuestionsData = data.relatedQuestions || [];
          } else if (data.formattedHtml) {
            // 4. Formatted HTML content
            console.log("[sendAgentQuestion] Using parsed formattedHtml");
            const parsed = parseFormattedHTML(
              data.formattedHtml,
              queryKeywords
            );
            geminiContent = parsed.mainAnswer;
            sourcesData = parsed.sources || [];
            relatedQuestionsData = parsed.relatedQuestions || [];
            isPreformattedHTML = !parsed.parsingFailed;
          } else if (data.gemini) {
            // 5. Support older 'gemini' field name
            console.log("[sendAgentQuestion] Using data.gemini");
            geminiContent = data.gemini;
            sourcesData = data.sources || [];
            relatedQuestionsData = data.relatedQuestions || [];
          } else if (typeof data.result === "string") {
            // 6. Result as direct string
            console.log("[sendAgentQuestion] Using data.result as string");
            geminiContent = data.result;
          } else {
            // 7. Fallback if no content found
            console.warn("[sendAgentQuestion] No recognizable content found");
            geminiContent =
              "No answer received from agent. Response format could not be interpreted.";
          }

          // Add the agent's answer to chat
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: question,
                gemini: geminiContent,
                sources: sourcesData,
                relatedQuestions: relatedQuestionsData,
                queryKeywords: queryKeywords,
                isLoader: "no",
                isSearch: true,
                searchType: "agent",
                isPreformattedHTML: isPreformattedHTML,
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
                  title: question.substring(0, 50),
                  message: {
                    user: question,
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
              console.error(
                "Error creating chat history for agent:",
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
                "Error saving agent chat history to localStorage:",
                err
              );
            }
          }

          dispatch(chatAction.newChatHandler());

          // Return a properly structured response object with the orchestrationComplete flag
          return {
            success: true,
            orchestrationComplete: true, // Flag to indicate direct handling
            data: {
              chatHistoryId: finalChatHistoryId,
            },
          };
        } catch (error) {
          console.error(
            `Error in orchestrated query for ${selectedAgent}:`,
            error
          );

          // Remove loading indicator
          dispatch(chatAction.popChat());

          // Show error message
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: question,
                gemini: `<p>Agent Error: ${error.message}</p>`,
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

          // Return a properly structured error response
          return {
            success: false,
            orchestrationComplete: true, // Flag to indicate direct handling
            error: error.message,
          };
        } finally {
          dispatch(uiAction.setLoading(false));
          dispatch(agentAction.setLoading(false));
        }
      } else {
        // Polling based agents
        const pollUrl = `${SERVER_ENDPOINT}/api/proxy-agent-poll`;
        const response = await fetch(pollUrl, {
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
        if (!response.ok)
          throw new Error(
            `Agent request failed: ${response.status} ${await response.text()}`
          );

        const data = await response.json();
        if (!data.success || !data.taskId)
          throw new Error(
            data.error || "Failed to submit question to polling agent."
          );

        dispatch(agentAction.setActiveTask(data.taskId));
        // The initial loading message is already in chat
        // Polling will update it when complete.

        return {
          success: true,
          taskId: data.taskId,
          agentTasks: { [selectedAgent]: { taskId: data.taskId } },
        };
      }
    } catch (error) {
      console.error("Error in sendAgentQuestion:", error.message);
      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: `<p>Agent Error: ${error.message}</p>`,
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
        error: error.message,
        orchestrationComplete: true,
      };
    } finally {
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));
    }
  };
};

export const pollAgentResponse = (taskId, agentId) => {
  return async (dispatch, getState) => {
    // Use the searchType from the loading message if available
    const loadingChatEntry = getState().chat.chats.find(
      (c) =>
        c.isLoader === "yes" &&
        (c.searchType === "polling_agent" || c.searchType === "agent")
    );
    const originalQuestion = loadingChatEntry?.user || `Agent Task: ${taskId}`;
    const originalSearchType = loadingChatEntry?.searchType || "agent"; // Default to agent if not found
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

      if (!response.ok)
        throw new Error(
          `Agent poll failed: ${response.status} ${await response.text()}`
        );
      const data = await response.json();
      console.log(
        `[pollAgentResponse] Poll response for task ${taskId}:`,
        data
      );

      if (data.status === "complete") {
        dispatch(chatAction.popChat());

        let geminiContent;
        let sourcesData = [];
        let relatedQuestionsData = [];
        let isPreformattedHTML = false;

        // FIXED: Enhanced to support multiple response formats
        // First check if we have data.result.answer or data.data.answer structure (nested objects)
        if (
          data.result &&
          typeof data.result === "object" &&
          typeof data.result.answer !== "undefined"
        ) {
          // Path 1a: Using structured result.answer format
          geminiContent = data.result.answer;
          sourcesData = data.result.sources || [];
          relatedQuestionsData = data.result.relatedQuestions || [];
          isPreformattedHTML = false;
          console.log(
            "[pollAgentResponse] Using data.result.answer structure:",
            { length: geminiContent.length }
          );
        } else if (
          data.data &&
          typeof data.data === "object" &&
          typeof data.data.answer !== "undefined"
        ) {
          // Path 1b: Using structured data.answer format
          geminiContent = data.data.answer;
          sourcesData = data.data.sources || [];
          relatedQuestionsData = data.data.relatedQuestions || [];
          isPreformattedHTML = false;
          console.log("[pollAgentResponse] Using data.data.answer structure:", {
            length: geminiContent.length,
          });
        } else if (data.formattedHtml) {
          // Path 2: Using formatted HTML that needs parsing
          const parsed = parseFormattedHTML(data.formattedHtml, queryKeywords);
          geminiContent = parsed.mainAnswer;
          sourcesData = parsed.sources;
          relatedQuestionsData = parsed.relatedQuestions;
          isPreformattedHTML = !parsed.parsingFailed;
          console.log("[pollAgentResponse] Using formatted HTML content:", {
            parsingFailed: parsed.parsingFailed,
          });
        } else if (data.final_answer) {
          // Path 3: Using orchestration service format
          geminiContent = data.final_answer;
          // Try to extract sources from retrieval_contexts if available
          if (
            data.retrieval_contexts &&
            Array.isArray(data.retrieval_contexts)
          ) {
            sourcesData = data.retrieval_contexts.map((ctx) => ({
              title: ctx.title || "Source",
              url: ctx.url || null,
              snippet: ctx.summary || "",
            }));
          }
          isPreformattedHTML = false;
          console.log(
            "[pollAgentResponse] Using orchestration format with final_answer:",
            { length: geminiContent.length }
          );
        } else if (
          typeof data.result === "string" &&
          data.result.trim() !== ""
        ) {
          // Path 4: Using data.result as a direct string
          geminiContent = data.result;
          isPreformattedHTML = false;
          console.log("[pollAgentResponse] Using data.result as string:", {
            preview: data.result.substring(0, 50),
          });
        } else if (data.gemini) {
          // Path 5: Support legacy 'gemini' field
          geminiContent = data.gemini;
          sourcesData = data.sources || [];
          relatedQuestionsData = data.relatedQuestions || [];
          isPreformattedHTML =
            typeof data.isPreformattedHTML === "boolean"
              ? data.isPreformattedHTML
              : false;
          console.log("[pollAgentResponse] Using legacy gemini field:", {
            length: geminiContent.length,
          });
        } else if (data.answer) {
          // Path 6: Direct answer field at root level
          geminiContent = data.answer;
          sourcesData = data.sources || [];
          relatedQuestionsData = data.relatedQuestions || [];
          isPreformattedHTML = false;
          console.log("[pollAgentResponse] Using direct answer field:", {
            length: geminiContent.length,
          });
        } else {
          // Fallback: If no content found in expected places
          console.warn(
            "[pollAgentResponse] No recognizable content format found, using fallback",
            data
          );
          geminiContent =
            "Agent completed the request, but no response content was found. This may indicate a format mismatch.";
          isPreformattedHTML = false;
        }

        // Ensure content is a string to prevent display issues
        if (typeof geminiContent !== "string") {
          console.warn(
            "[pollAgentResponse] geminiContent is not a string, converting:",
            typeof geminiContent
          );
          try {
            geminiContent = JSON.stringify(geminiContent, null, 2);
          } catch (e) {
            geminiContent =
              "Agent returned a non-text response that couldn't be displayed properly.";
          }
        }

        // Final check to ensure we have some content
        if (!geminiContent || geminiContent.trim() === "") {
          console.warn(
            "[pollAgentResponse] Empty content after processing, using fallback"
          );
          geminiContent =
            "Agent completed the request, but returned an empty response.";
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
              searchType: originalSearchType,
              isPreformattedHTML: isPreformattedHTML,
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
                title: (data.question || originalQuestion).substring(0, 50),
                message: {
                  user: data.question || originalQuestion,
                  gemini: geminiContent,
                  sources: sourcesData,
                  relatedQuestions: relatedQuestionsData,
                  queryKeywords,
                  isPreformattedHTML,
                },
                isSearch: true,
                searchType: originalSearchType,
              }),
            });
            if (historyResponse.ok) {
              const historyData = await historyResponse.json();
              if (historyData.success && historyData.chatHistoryId)
                finalChatHistoryId = historyData.chatHistoryId;
            }
          } catch (historyError) {
            console.error(
              "Error creating chat history for polled agent:",
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
              title: (data.question || originalQuestion).substring(0, 50),
              timestamp: new Date().toISOString(),
              type: originalSearchType,
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
              "Error saving polled agent chat history to localStorage:",
              err
            );
          }
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
              searchType: originalSearchType,
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
      console.error("Error in pollAgentResponse:", error.message);
      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: originalQuestion,
            gemini: `<p>Polling Error: ${error.message}</p>`,
            isLoader: "no",
            isSearch: true,
            searchType: originalSearchType,
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
