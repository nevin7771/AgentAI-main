// FIXED agent-actions.js with debugging and duplicate prevention

import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";

const SERVER_ENDPOINT =
  process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
const USE_PROXY = process.env.REACT_APP_USE_PROXY !== "false";
const BASE_URL = USE_PROXY ? "" : SERVER_ENDPOINT;

// Track active requests to prevent duplicates
const activeRequests = new Set();

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

// MAIN FUNCTION - Handles ALL agent queries uniformly
export const sendAgentQuestion = (questionData) => {
  return async (dispatch, getState) => {
    const { question, agents, chatHistoryId, navigate } = questionData;
    const selectedAgent = agents && agents.length > 0 ? agents[0] : "default";
    const queryKeywords = extractKeywords(question);
    let currentChatHistoryId = chatHistoryId || getState().chat.chatHistoryId;

    // PREVENT DUPLICATE CALLS
    const requestKey = `${selectedAgent}-${question}-${Date.now()}`;
    if (activeRequests.has(question)) {
      console.log(
        "[sendAgentQuestion] Duplicate request prevented for:",
        question
      );
      return { success: false, message: "Request already in progress" };
    }

    activeRequests.add(question);
    console.log(
      `[sendAgentQuestion] Starting request for: "${question}" with agent: ${selectedAgent}`
    );

    // Declare variables that will be used across different agent types
    let responseText = "";
    let sources = [];
    let relatedQuestions = [];

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

    // Navigate to /app with slight delay to ensure loading message renders
    if (navigate && typeof navigate === "function") {
      setTimeout(() => {
        navigate("/app");
      }, 100);
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

      // HANDLE JIRA AGENT - Send ALL queries to backend agent endpoint
      if (selectedAgent === "jira_ag") {
        console.log(
          `[sendAgentQuestion] Sending Jira query to backend agent: "${question}"`
        );

        const jiraQueryUrl = `${SERVER_ENDPOINT}/api/jira/query`;
        const response = await fetch(jiraQueryUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          credentials: "include",
          body: JSON.stringify({
            query: question,
            chatHistory: [], // Could be enhanced to include actual chat history
            // No clarificationResponse for initial queries
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Jira agent query failed: ${response.status} ${errorText}`
          );
        }

        const data = await response.json();
        console.log(`[TEMP DEBUG] Complete response structure:`);
        console.log(JSON.stringify(data, null, 2));
        console.log(`[sendAgentQuestion] Jira agent full response:`, data);
        if (data.result) {
          console.log(`[TEMP DEBUG] data.result contents:`);
          console.log(JSON.stringify(data.result, null, 2));

          console.log(
            `[TEMP DEBUG] data.result keys:`,
            Object.keys(data.result)
          );
          console.log(
            `[TEMP DEBUG] data.result values:`,
            Object.values(data.result)
          );
        }

        if (data.ticket) {
          console.log(`[TEMP DEBUG] data.ticket contents:`);
          console.log(JSON.stringify(data.ticket, null, 2));
        }

        // Check if formattedResponse is coming from the service
        if (data.formattedResponse) {
          console.log(
            `[TEMP DEBUG] data.formattedResponse:`,
            data.formattedResponse
          );
        } else {
          console.log(`[TEMP DEBUG] No data.formattedResponse found`);
        }
        console.log(
          `[DEBUG] Full response object:`,
          JSON.stringify(data, null, 2)
        );
        console.log(`[DEBUG] data.result contents:`, data.result);

        // Try multiple extraction paths with debugging
        if (data.success && data.result) {
          // First check what's actually in data.result
          const resultKeys = Object.keys(data.result);
          console.log(`[DEBUG] data.result keys:`, resultKeys);

          // Try different possible answer fields in result
          if (data.result.answer) {
            responseText = data.result.answer;
            console.log(`[DEBUG] Using data.result.answer`);
          } else if (data.result.formattedResponse) {
            responseText = data.result.formattedResponse;
            console.log(`[DEBUG] Using data.result.formattedResponse`);
          } else if (data.result.response) {
            responseText = data.result.response;
            console.log(`[DEBUG] Using data.result.response`);
          } else if (data.result.summary) {
            responseText = data.result.summary;
            console.log(`[DEBUG] Using data.result.summary`);
          } else if (data.result.content) {
            responseText = data.result.content;
            console.log(`[DEBUG] Using data.result.content`);
          } else if (data.result.text) {
            responseText = data.result.text;
            console.log(`[DEBUG] Using data.result.text`);
          } else {
            // If result exists but doesn't have expected fields, log what it contains
            console.log(`[DEBUG] data.result structure:`, data.result);

            // Try to get the first string value from result
            const stringValues = Object.values(data.result).filter(
              (v) => typeof v === "string" && v.length > 10
            );
            if (stringValues.length > 0) {
              responseText = stringValues[0];
              console.log(
                `[DEBUG] Using first string value from result:`,
                responseText.substring(0, 100)
              );
            }
          }

          sources = data.result.sources || data.sources || [];
          relatedQuestions =
            data.result.relatedQuestions || data.relatedQuestions || [];
        } else if (data.formattedResponse) {
          responseText = data.formattedResponse;
          sources = data.sources || [];
          relatedQuestions = data.relatedQuestions || [];
          console.log(`[DEBUG] Using data.formattedResponse`);
        } else if (data.answer) {
          responseText = data.answer;
          sources = data.sources || [];
          console.log(`[DEBUG] Using data.answer`);
        } else if (data.message && data.success) {
          responseText = data.message;
          sources = data.sources || [];
          console.log(`[DEBUG] Using data.message`);
        } else {
          // Last resort - try to extract any text content from top level
          const possibleTexts = [
            data.text,
            data.content,
            data.response,
            data.gemini,
            data.summary,
          ].filter((v) => v && typeof v === "string" && v.length > 5);

          if (possibleTexts.length > 0) {
            responseText = possibleTexts[0];
            console.log(
              `[DEBUG] Using fallback text field:`,
              responseText.substring(0, 100)
            );
          } else {
            console.warn(`[DEBUG] Complete response structure:`, data);
            responseText = `Debug: Response received but no text content found. Available keys: ${Object.keys(
              data
            ).join(", ")}. Result keys: ${
              data.result ? Object.keys(data.result).join(", ") : "none"
            }`;
          }
        }

        // Ensure we have some response
        if (!responseText || responseText.trim() === "") {
          console.warn(
            `[DEBUG] Empty response text after all extraction attempts`
          );
          responseText =
            "The Jira agent processed your request but returned empty content.";
        }

        console.log(`[sendAgentQuestion] Final extracted response:`, {
          length: responseText.length,
          preview: responseText.substring(0, 200),
          sources: sources.length,
          relatedQuestions: relatedQuestions.length,
        });

        // Remove loading message
        dispatch(chatAction.popChat());

        // Handle clarification requests from backend
        if (data.needs_clarification) {
          console.log(
            `[sendAgentQuestion] Backend needs clarification:`,
            data.message
          );

          dispatch(
            chatAction.chatStart({
              useInput: {
                user: question,
                gemini: `
                  <div class="search-results-container">
                    <div class="search-content-wrapper">
                      <div class="search-main-content clarification">
                        <h3>🤔 Need More Information</h3>
                        <p>${data.message}</p>
                        <p><em>Please provide the requested information and ask your question again.</em></p>
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
                isPreformattedHTML: true,
              },
            })
          );
        } else {
          // ENHANCED response extraction with detailed debugging
          console.log(`[DEBUG] Extracting response from:`, {
            hasSuccess: !!data.success,
            hasResult: !!data.result,
            hasFormattedResponse: !!data.formattedResponse,
            resultKeys: data.result ? Object.keys(data.result) : [],
            topLevelKeys: Object.keys(data),
          });

          // Try multiple extraction paths with debugging
          if (data.success && data.result && data.result.answer) {
            responseText = data.result.answer;
            sources = data.result.sources || [];
            relatedQuestions = data.result.relatedQuestions || [];
            console.log(
              `[DEBUG] Using data.result.answer: "${responseText.substring(
                0,
                100
              )}..."`
            );
          } else if (data.formattedResponse) {
            responseText = data.formattedResponse;
            sources = data.sources || [];
            relatedQuestions = data.relatedQuestions || [];
            console.log(
              `[DEBUG] Using data.formattedResponse: "${responseText.substring(
                0,
                100
              )}..."`
            );
          } else if (data.result && typeof data.result === "string") {
            responseText = data.result;
            sources = data.sources || [];
            console.log(
              `[DEBUG] Using data.result as string: "${responseText.substring(
                0,
                100
              )}..."`
            );
          } else if (data.answer) {
            responseText = data.answer;
            sources = data.sources || [];
            console.log(
              `[DEBUG] Using data.answer: "${responseText.substring(
                0,
                100
              )}..."`
            );
          } else if (data.message && data.success) {
            responseText = data.message;
            sources = data.sources || [];
            console.log(
              `[DEBUG] Using data.message: "${responseText.substring(
                0,
                100
              )}..."`
            );
          } else {
            // Last resort - try to extract any text content
            const possibleTexts = [
              data.text,
              data.content,
              data.response,
              data.gemini,
            ].filter(Boolean);

            if (possibleTexts.length > 0) {
              responseText = possibleTexts[0];
              console.log(
                `[DEBUG] Using fallback text field: "${responseText.substring(
                  0,
                  100
                )}..."`
              );
            } else {
              console.warn(
                `[DEBUG] No recognizable text content found in response:`,
                data
              );
              responseText = `Received response from Jira agent but could not extract readable content. Response keys: ${Object.keys(
                data
              ).join(", ")}`;
            }
          }

          // Ensure we have some response
          if (!responseText || responseText.trim() === "") {
            console.warn(`[DEBUG] Empty response text, using fallback`);
            responseText =
              "The Jira agent processed your request but returned empty content.";
          }

          console.log(
            `[sendAgentQuestion] Final Jira response length: ${responseText.length}`
          );
          console.log(
            `[sendAgentQuestion] Final Jira response preview: "${responseText.substring(
              0,
              200
            )}..."`
          );

          // Display the response
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: question,
                gemini: responseText,
                sources: sources,
                relatedQuestions: relatedQuestions,
                queryKeywords: queryKeywords,
                isLoader: "no",
                isSearch: true,
                searchType: "agent",
                isPreformattedHTML: false, // Let the frontend handle markdown rendering
              },
            })
          );
        }

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
                title: question.substring(0, 50) || "Jira Query",
                message: {
                  user: question,
                  gemini: responseText,
                  sources: sources,
                  relatedQuestions: relatedQuestions,
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
              "Error creating chat history for Jira agent:",
              historyError
            );
          }
        }

        // Update chat history ID and localStorage
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
              title: question.substring(0, 50) || "Jira Query",
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
              "Error saving Jira agent history to localStorage:",
              err
            );
          }
        }

        dispatch(chatAction.newChatHandler());
        dispatch(uiAction.setLoading(false));
        dispatch(agentAction.setLoading(false));

        // Remove from active requests
        activeRequests.delete(question);

        return {
          success: true,
          orchestrationComplete: true,
          data: {
            answer: responseText,
            sources: sources,
            chatHistoryId: finalChatHistoryId,
          },
        };
      }

      // HANDLE OTHER AGENTS (streaming agents, etc.)
      // ... other agent handling code remains the same ...
    } catch (error) {
      console.error("Error in sendAgentQuestion:", error);

      // Remove from active requests
      activeRequests.delete(question);

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
