import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";
//import { getRecentChat } from "./chat-action";

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

export const getJiraTicketSummary = (ticketId, originalQuery = null) => {
  return async (dispatch, getState) => {
    const queryKeywords = extractKeywords(`Jira ticket ${ticketId}`);
    let currentChatHistoryId = getState().chat.chatHistoryId;

    const anyLoadingIndicator = getState().chat.chats.some(
      (c) => c.isLoader === "yes"
    );

    // Only set app-level loading if we don't have a chat-level loading indicator
    if (!anyLoadingIndicator) {
      dispatch(uiAction.setLoading(true));
      dispatch(agentAction.setLoading(true));
    }

    // Check if we already have this exact loading message to avoid duplicates
    const hasDuplicateTicketLoader = getState().chat.chats.some(
      (c) =>
        c.isLoader === "yes" &&
        c.searchType === "agent" &&
        c.user &&
        c.user.includes(ticketId)
    );

    // Only add loading message if there's no original query
    // or if we're not replacing an existing message
    if (!originalQuery && !hasDuplicateTicketLoader && !anyLoadingIndicator) {
      console.log(
        `[getJiraTicketSummary] Adding loading indicator for ticket ${ticketId}`
      );

      // Display loading message
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
      // Get JWT token for authentication
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
        console.warn(
          "Token generation failed, continuing without token:",
          tokenError
        );
      }

      // Direct ticket API call to new jira_agent endpoint
      const ticketUrl = `${SERVER_ENDPOINT}/api/jira/ticket/${ticketId}`;
      console.log(
        `[getJiraTicketSummary] Fetching ticket ${ticketId} from ${ticketUrl}`
      );

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
      console.log(
        `[getJiraTicketSummary] Got response for ticket ${ticketId}:`,
        data
      );

      if (!data.success) {
        throw new Error(data.message || "Failed to get ticket summary");
      }

      // Remove loading message
      dispatch(chatAction.popChat());

      // Format and display response
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

      // Create chat history if needed
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
          console.error(
            "Error creating chat history for Jira ticket:",
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
            title: `Jira Ticket ${ticketId}`,
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
            "Error saving Jira ticket history to localStorage:",
            err
          );
        }
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

      // Remove loading indicator
      dispatch(chatAction.popChat());

      // Show error message
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

export const sendAgentQuestion = (questionData) => {
  return async (dispatch, getState) => {
    const { question, agents, chatHistoryId, navigate } = questionData;
    const selectedAgent = agents && agents.length > 0 ? agents[0] : "default";
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;

    // Check if this is a Jira ticket query when using the Jira agent
    if (selectedAgent === "jira_ag") {
      // Various patterns to detect Jira ticket references
      const jiraTicketPattern = /\b([A-Z]+-\d+)\b/; // Basic pattern like ZSEE-12345
      const jiraTicketAskPattern =
        /(?:ticket|issue|jira)\s+(?:number|id|key)?\s*(?:is|:)?\s*([A-Z]+-\d+)/i;
      const summarizePattern =
        /(?:summarize|describe|details|about|get|fetch|show|find)\s+(?:jira|ticket|issue)?\s+(?:number|id|key|#)?\s*([A-Z]+-\d+)/i;

      // Try to match with different patterns
      const matches = [
        question.match(summarizePattern),
        question.match(jiraTicketAskPattern),
        question.match(jiraTicketPattern),
      ].filter(Boolean);

      if (matches.length > 0) {
        // Extract the ticket ID from the first successful match
        const ticketMatch = matches[0];
        const ticketId = ticketMatch[1];

        if (ticketId) {
          console.log(
            `[sendAgentQuestion] Detected Jira ticket ${ticketId}, using direct API`
          );

          // Always show loading UI first
          dispatch(uiAction.setLoading(true));
          dispatch(agentAction.setLoading(true));

          // Display loading message
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

          // Navigate if needed
          if (navigate && typeof navigate === "function") {
            navigate("/app");
          }

          // Then call the actual ticket summary function
          return dispatch(getJiraTicketSummary(ticketId, question));
        }
      }
    }

    const anyLoadingIndicator = getState().chat.chats.some(
      (c) => c.isLoader === "yes"
    );

    // Only set app-level loading if we don't have any loading indicators already
    if (!anyLoadingIndicator) {
      dispatch(uiAction.setLoading(true));
      dispatch(agentAction.setLoading(true));
    }

    // Check for this specific loading message to avoid duplicates
    const hasDuplicateLoader = getState().chat.chats.some(
      (c) =>
        c.isLoader === "yes" && c.searchType === "agent" && c.user === question
    );

    // Dispatch initial loading message to the chat
    if (!anyLoadingIndicator && !hasDuplicateLoader) {
      console.log(
        `[sendAgentQuestion] Adding loading indicator for: "${question.substring(
          0,
          50
        )}..."`
      );

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
    }

    // For orchestrated agents (Jira, Confluence), navigate to /app with a slight delay
    // to ensure the loading message is rendered first
    if (navigate && typeof navigate === "function") {
      setTimeout(() => {
        navigate("/app");
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

      // HANDLE JIRA AGENT GENERAL QUERIES (not ticket lookups)
      if (selectedAgent === "jira_ag") {
        try {
          // Get recent chats for context - WITH PROPER SAFETY CHECKS
          let chatHistory = [];
          try {
            // Properly access recentChats with safe fallbacks
            // Fix the "recentChats.map is not a function" error
            const recentChats = getState().chat.recentChat || [];

            if (recentChats && Array.isArray(recentChats)) {
              chatHistory = recentChats
                .filter((chat) => chat && typeof chat === "object")
                .map((chat) => {
                  return {
                    role: chat.isUser ? "user" : "assistant",
                    content: chat.isUser ? chat.user : chat.gemini,
                  };
                });
            } else {
              console.log("recentChats is not an array:", recentChats);
            }
          } catch (historyError) {
            console.warn("Error processing chat history:", historyError);
            // Continue with empty chat history
          }

          // Extract potential issue area/project from the question
          let issueArea = null;
          let project = null;

          // Simple extraction of context from question (can be enhanced)
          if (question.includes("Desktop")) issueArea = "Desktop Client";
          else if (question.includes("Mobile")) issueArea = "Mobile Client";
          else if (question.includes("Audio")) issueArea = "Audio";
          else if (question.includes("Video")) issueArea = "Video";

          if (question.includes("ZSEE")) project = "ZSEE";
          else if (question.includes("ZOOM")) project = "ZOOM";

          // Create request payload
          const jiraRequestUrl = `${SERVER_ENDPOINT}/api/jira/query`;
          const requestBody = {
            query: question,
            chatHistory: Array.isArray(chatHistory) ? chatHistory : [],
            clarificationResponse: null,
            metadata: {
              issueArea,
              project,
              originalQuery: question,
            },
          };

          console.log(`[sendAgentQuestion] Sending Jira query:`, {
            url: jiraRequestUrl,
            bodyPreview: {
              query: requestBody.query,
              chatHistoryLength: requestBody.chatHistory.length,
              metadata: requestBody.metadata,
            },
          });

          const response = await fetch(jiraRequestUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            credentials: "include",
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
              `Jira query failed: ${response.status} ${errorText}`
            );
          }

          const data = await response.json();
          console.log(`[sendAgentQuestion] Jira response:`, data);

          // Check if we need clarification
          if (data.needs_clarification) {
            // Handle clarification needed
            dispatch(chatAction.popChat());
            dispatch(
              chatAction.chatStart({
                useInput: {
                  user: question,
                  gemini: `<div class="search-results-container">
                  <div class="search-content-wrapper">
                    <div class="search-main-content">
                      <h3>Clarification Needed</h3>
                      <p>${data.message}</p>
                      <p>Please provide more information so I can better answer your question.</p>
                    </div>
                  </div>
                </div>`,
                  isLoader: "no",
                  isSearch: true,
                  searchType: "agent",
                  needs_user_input: true,
                  missing_info: data.clarification_type,
                  queryKeywords: queryKeywords,
                  sources: [],
                  isPreformattedHTML: true,
                },
              })
            );
            dispatch(uiAction.setLoading(false));
            dispatch(agentAction.setLoading(false));
            return {
              success: true,
              needsClarification: true,
              message: data.message,
            };
          }

          // Format the response
          const formattedResponse =
            data.formattedResponse || data.result?.answer || "";
          const sources = data.sources || data.result?.sources || [];

          // Remove loading message
          dispatch(chatAction.popChat());

          // Add the completed response to chat
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: question,
                gemini: formattedResponse,
                sources: sources,
                relatedQuestions: data.result?.relatedQuestions || [],
                queryKeywords: queryKeywords,
                isLoader: "no",
                isSearch: true,
                searchType: "agent",
                isPreformattedHTML: true,
              },
            })
          );

          // Get final chat history ID with proper fallbacks
          let finalChatHistoryId = currentChatHistoryId || data.chatHistoryId;
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
                    gemini: formattedResponse,
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
                if (historyData.success && historyData.chatHistoryId)
                  finalChatHistoryId = historyData.chatHistoryId;
              }
            } catch (historyError) {
              console.error(
                "Error creating chat history for Jira agent:",
                historyError
              );
              finalChatHistoryId = `jira_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 7)}`;
            }
          }

          // Update chat history ID
          dispatch(
            chatAction.chatHistoryIdHandler({
              chatHistoryId: finalChatHistoryId,
            })
          );

          // Save to localStorage for history
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
              "Error saving Jira chat history to localStorage:",
              err
            );
          }

          dispatch(chatAction.newChatHandler());
          dispatch(uiAction.setLoading(false));
          dispatch(agentAction.setLoading(false));

          return {
            success: true,
            orchestrationComplete: true,
            data: {
              answer: formattedResponse,
              sources: sources,
              chatHistoryId: finalChatHistoryId,
            },
          };
        } catch (error) {
          console.error("Error in Jira agent query:", error);
          throw error; // Pass to outer catch block
        }
      }

      // HANDLE DAY ONE AND MONITOR AGENTS
      if (
        selectedAgent === "dayone" ||
        selectedAgent === "monitor" ||
        selectedAgent === "conf_ag"
      ) {
        // ... existing code for these agents ...
      }

      // HANDLE OTHER AGENTS (non-streaming)
      // ... existing code for other agents ...
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
