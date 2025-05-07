// public/src/store/agent-actions.js
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

    // Navigate to the main chat page if navigate function is provided and not already on it
    // This is a common pattern: initiate action, navigate, then action updates store for new page.
    if (navigate && typeof navigate === "function") {
      // Check current path if possible, or just navigate. For simplicity, we assume it_s called from a non-chat page.
      // Or the component calling this handles the navigation to /app or /app/:chatId
      // If a new chat is being created, navigate to /app, then chatHistoryId will be set.
      // If an existing chat, it should already be on /app/:chatId or navigate there.
      // For now, we assume the calling component (AgentChat.js) handles this navigation to /app.
    }

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
          // CRITICAL: Set searchType for Jira/Confluence to ensure sparkle animation
          searchType:
            selectedAgent === "jira_ag" || selectedAgent === "conf_ag"
              ? "agent"
              : "polling_agent",
          queryKeywords: queryKeywords,
          sources: [],
          relatedQuestions: [],
          isPreformattedHTML: false,
        },
      })
    );

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
        if (!data.success) {
          throw new Error(
            data.error ||
              `Orchestrated query for ${selectedAgent} was not successful.`
          );
        }

        dispatch(chatAction.popChat());

        const geminiContent = data.final_answer
          ? data.final_answer.toString()
          : "No answer received from agent.";
        const sourcesData = data.sources || [];
        const relatedQuestionsData = data.related_questions || [];

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
              searchType: "agent", // Consistent searchType for the response
              isPreformattedHTML: false,
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
        // The initial loading message (with searchType: "polling_agent") is already in chat.
        // Polling will update it when complete.
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
            searchType:
              selectedAgent === "jira_ag" || selectedAgent === "conf_ag"
                ? "agent"
                : "polling_agent",
            queryKeywords: queryKeywords,
            sources: [],
            relatedQuestions: [],
            error: true,
            isPreformattedHTML: true,
          },
        })
      );
      dispatch(chatAction.newChatHandler());
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

      if (data.status === "complete") {
        dispatch(chatAction.popChat());

        let geminiContent;
        let sourcesData = [];
        let relatedQuestionsData = [];
        let isPreformattedHTML = false;

        if (data.result && typeof data.result.answer !== "undefined") {
          geminiContent = data.result.answer;
          sourcesData = data.result.sources || [];
          relatedQuestionsData = data.result.relatedQuestions || [];
          isPreformattedHTML = false;
        } else if (data.formattedHtml) {
          const parsed = parseFormattedHTML(data.formattedHtml, queryKeywords);
          geminiContent = parsed.mainAnswer;
          sourcesData = parsed.sources;
          relatedQuestionsData = parsed.relatedQuestions;
          isPreformattedHTML = parsed.parsingFailed;
        } else {
          geminiContent = data.result || "Agent response processed.";
          isPreformattedHTML = typeof geminiContent !== "string";
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
              searchType: originalSearchType, // Use the original searchType for consistency
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
