// public/src/components/AgentPolling/AgentPollingManager.js
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { chatAction } from "../../store/chat";
import { agentAction } from "../../store/agent";
import { SERVER_ENDPOINT } from "../../store/agent-actions";
import proxyAgentPoll from "../../utils/proxyAgentPoller";
import { useNavigate } from "react-router-dom";

/**
 * Manages polling of agent tasks directly to external APIs
 * This component doesn't render anything but manages polling in the background
 */
const AgentPollingManager = ({
  agentId,
  taskId,
  endpoint,
  token,
  onComplete,
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);

  useEffect(() => {
    // Skip if missing required params
    if (!agentId || !taskId || !endpoint || !token) {
      console.log("Missing required parameters for agent polling");
      return;
    }

    let isMounted = true;

    const startPolling = async () => {
      if (isPolling) return;

      setIsPolling(true);
      console.log(
        `Starting agent polling for ${agentId} with taskId ${taskId}`
      );

      try {
        await proxyAgentPoll(
          {
            agentId,
            taskId,
            maxAttempts: 30,
            interval: 2000,
          },
          // On Complete
          (data) => {
            if (!isMounted) return;

            console.log(`Agent ${agentId} task complete:`, data);

            // Process result even if it's an error message from the agent
            let resultText = "";
            if (data.result) {
              // Ensure result is a string
              resultText =
                typeof data.result === "object"
                  ? JSON.stringify(data.result, null, 2)
                  : String(data.result);
            } else {
              resultText = "Agent returned no result data";
            }

            // Check for error codes in the result
            const isErrorResult =
              resultText.includes("error code") ||
              resultText.includes("not explicitly");

            // Format the result
            console.log(
              `Formatting result for agent ${agentId}. Result:`,
              resultText
            );

            // Apply formatting to the result text
            try {
              // Replace Markdown headers with HTML headers
              resultText = resultText.replace(/##\s+([^\n]+)/g, "<h2>$1</h2>");

              // Replace Markdown list items with HTML list items
              resultText = resultText.replace(
                /^\s*-\s+([^\n]+)/gm,
                "<li>$1</li>"
              );

              // Wrap list items in unordered lists
              if (resultText.includes("<li>")) {
                resultText = resultText.replace(
                  /(<li>.*?<\/li>)\s*\n\s*(?!<li>)/gs,
                  "$1</ul>\n"
                );
                resultText = resultText.replace(
                  /(?<!<\/ul>)\s*\n\s*(<li>)/gs,
                  "\n<ul>$1"
                );

                // Close any remaining unclosed lists
                if (
                  (resultText.match(/<ul>/g) || []).length >
                  (resultText.match(/<\/ul>/g) || []).length
                ) {
                  resultText += "</ul>";
                }
              }

              // Convert Markdown line breaks to HTML breaks
              resultText = resultText.replace(/\n\n/g, "<br><br>");
              resultText = resultText.replace(/\n/g, "<br>");
            } catch (e) {
              console.error("Error formatting Markdown:", e);
              // Fall back to simple string with line breaks
              resultText = resultText.replace(/\n/g, "<br>");
            }

            console.log("Final formatted HTML result:", resultText);

            // Build the HTML content based on whether it's an error or normal response
            const formattedResult = `
              <div class="simple-search-results ${
                isErrorResult ? "error-content" : ""
              }">
                <h3>Agent Response (${agentId})</h3>
                
                <div class="simple-search-content">
                  <div class="agent-result">
                    <h4>${isErrorResult ? "Error Response" : "Answer"}</h4>
                    <div class="agent-answer">
                      ${resultText}
                    </div>
                  </div>
                </div>
                
                ${
                  !isErrorResult
                    ? `
                <div class="search-key-points">
                  <h4>Key Points</h4>
                  <ul>
                    <li>This response came directly from the ${agentId} agent</li>
                    <li>Responses processed directly from the agent API</li>
                    <li>For more perspectives, try selecting multiple agents</li>
                  </ul>
                </div>
                `
                    : ""
                }
                
                <div class="search-related-section">
                  <h4>Next Steps</h4>
                  <p>You can try:</p>
                  <ul>
                    <li>Asking a more specific question</li>
                    <li>Including more details in your query</li>
                    <li>Selecting different agents for other perspectives</li>
                  </ul>
                </div>
                
                <div class="search-follow-up">
                  <h4>Follow-up Questions</h4>
                  <div class="gemini-chips-container">
                    <div class="gemini-chips">
                      <button class="gemini-chip" onclick="document.querySelector('.input-field').value='Tell me more about error codes'; setTimeout(() => document.querySelector('.send-btn').click(), 100);">
                        <span class="gemini-chip-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" 
                              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </span>
                        <span class="gemini-chip-text">Tell me more about error codes</span>
                      </button>
                      <button class="gemini-chip" onclick="document.querySelector('.input-field').value='How to troubleshoot network errors?'; setTimeout(() => document.querySelector('.send-btn').click(), 100);">
                        <span class="gemini-chip-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" 
                              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </span>
                        <span class="gemini-chip-text">How to troubleshoot network errors?</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `;

            // Update chat with result - always remove loading message first
            dispatch(chatAction.popChat());

            // Add the result to chat
            dispatch(
              chatAction.chatStart({
                useInput: {
                  user: data.question || "Agent query",
                  gemini: formattedResult,
                  isLoader: "no",
                  isSearch: true,
                  searchType: "agent", // Use agent format for clarity
                },
              })
            );

            // Generate a random ID for the chat if needed
            const chatId =
              chatHistoryId ||
              `agent_${Date.now()}_${Math.random()
                .toString(36)
                .substring(2, 9)}`;

            // Set chat history ID
            dispatch(
              chatAction.chatHistoryIdHandler({
                chatHistoryId: chatId,
              })
            );

            // Create the chat history on the server
            fetch(`${SERVER_ENDPOINT}/api/create-chat-history`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              credentials: "include",
              body: JSON.stringify({
                title: data.question || "Agent response",
                message: {
                  user: data.question || "Agent query",
                  gemini: formattedResult,
                },
                isSearch: true,
                searchType: "agent",
              }),
            })
              .then((response) => {
                if (response.ok) {
                  return response.json();
                } else {
                  console.error(
                    "Error creating chat history:",
                    response.statusText
                  );
                  throw new Error(response.statusText);
                }
              })
              .then((result) => {
                if (result.success && result.chatHistoryId) {
                  // Update chat history ID with the one from the server
                  dispatch(
                    chatAction.chatHistoryIdHandler({
                      chatHistoryId: result.chatHistoryId,
                    })
                  );

                  // Navigate to the chat page with the new history ID
                  navigate(`/app/${result.chatHistoryId}`);
                } else {
                  // Fallback - use the random ID we created
                  navigate(`/app/${chatId}`);
                }
              })
              .catch((error) => {
                console.error("Error creating chat history:", error);
                // Fallback - use the ID we had
                navigate(`/app/${chatId}`);
              });

            // Clear active task
            dispatch(agentAction.clearActiveTask());

            // Call onComplete callback
            if (onComplete) onComplete(data);

            setIsPolling(false);
          },
          // On Pending
          (data) => {
            if (!isMounted) return;
            console.log(`Agent ${agentId} task still pending:`, data);
          },
          // On Error
          (error) => {
            if (!isMounted) return;
            console.error(`Agent ${agentId} polling error:`, error);
            setError(error.message || "Unknown error");

            // Show error in chat
            dispatch(chatAction.popChat()); // Remove loading message
            dispatch(
              chatAction.chatStart({
                useInput: {
                  user: "Agent query",
                  gemini: `<div class="simple-search-results error">
                    <h3>Agent Error</h3>
                    <p>Sorry, there was an error getting a response from the agent: ${
                      error.message || "Unknown error"
                    }</p>
                  </div>`,
                  isLoader: "no",
                  isSearch: true,
                },
              })
            );

            // Navigate to app page to show the error
            navigate("/app");

            // Clear active task
            dispatch(agentAction.clearActiveTask());
            setIsPolling(false);
          }
        );
      } catch (error) {
        if (!isMounted) return;
        console.error(`Agent polling failed:`, error);
        setError(error.message || "Unknown error");

        // Show error in chat
        dispatch(chatAction.popChat()); // Remove loading message
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: "Agent query",
              gemini: `<div class="simple-search-results error">
                <h3>Agent Error</h3>
                <p>Sorry, there was an error getting a response from the agent: ${
                  error.message || "Unknown error"
                }</p>
              </div>`,
              isLoader: "no",
              isSearch: true,
            },
          })
        );

        // Navigate to app page to show the error
        navigate("/app");

        setIsPolling(false);
        // Clear active task
        dispatch(agentAction.clearActiveTask());
      }
    };

    startPolling();

    return () => {
      isMounted = false;
    };
  }, [
    agentId,
    taskId,
    endpoint,
    token,
    dispatch,
    chatHistoryId,
    navigate,
    onComplete,
  ]);

  return null; // This component doesn't render anything
};

export default AgentPollingManager;
