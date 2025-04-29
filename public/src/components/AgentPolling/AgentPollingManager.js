// public/src/components/AgentPolling/AgentPollingManager.js
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { chatAction } from "../../store/chat";
import { agentAction } from "../../store/agent";
import { SERVER_ENDPOINT } from "../../store/agent-actions";
import proxyAgentPoll from "../../utils/proxyAgentPoller";
import { useNavigate } from "react-router-dom";
import { highlightKeywords } from "../../utils/highlightKeywords";

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

            // Highlight keywords from the question
            const highlightedText = highlightKeywords(
              resultText,
              data.question
            );

            console.log("Final formatted HTML result:", resultText);

            // Build the HTML content based on whether it's an error or normal response
            const formattedResult = `
              <div class="simple-search-results ${
                isErrorResult ? "error-content" : ""
              }">                
                <div class="search-content-wrapper">
                  <div class="search-main-content">
                    ${isErrorResult}
                    <div class="agent-answer">
                      ${highlightedText}
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
