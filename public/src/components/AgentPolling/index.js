// public/src/components/AgentPolling/index.js
import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { uiAction } from "../../store/ui-gemini";
import { chatAction } from "../../store/chat";
import { agentAction } from "../../store/agent";
import { highlightKeywords } from "../../utils/highlightKeywords";

const AgentPollingManager = ({
  agentId,
  taskId,
  endpoint,
  token,
  onComplete,
}) => {
  const dispatch = useDispatch();
  const [pollCount, setPollCount] = useState(0);
  const [isPolling, setIsPolling] = useState(true);
  const [pollError, setPollError] = useState(null);
  const maxPolls = 30;
  const pollInterval = 2000;

  useEffect(() => {
    let pollTimer = null;
    let attemptCount = 0;

    const formatResponse = (data, query) => {
      // Format the result text from the agent
      let resultText = "";
      if (data.result) {
        resultText =
          typeof data.result === "object"
            ? JSON.stringify(data.result, null, 2)
            : String(data.result);
      } else {
        resultText = "No result provided by the agent.";
      }

      // Clean up HTML tags if they exist
      resultText = resultText
        .replace(/<\/?h1>/g, "")
        .replace(/<\/?h2>/g, "")
        .replace(/<\/?h3>/g, "")
        .replace(/<\/?p>/g, "\n\n")
        .replace(/<br\s*\/?>/g, "\n")
        .replace(/<\/?ul>/g, "")
        .replace(/<\/?ol>/g, "")
        .replace(/<li>/g, "• ")
        .replace(/<\/li>/g, "\n");

      // Convert markdown style to HTML
      resultText = resultText
        .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
        .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
        .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/\n\n/g, "</p><p>")
        .replace(/\n•\s+/g, "</li><li>");

      // Wrap with paragraph tags
      resultText = `<p>${resultText}</p>`;

      // Fix any double wrapping
      resultText = resultText
        .replace(/<p><p>/g, "<p>")
        .replace(/<\/p><\/p>/g, "</p>");

      // Highlight keywords if query exists
      if (query) {
        resultText = highlightKeywords(resultText, query);
      }

      return resultText;
    };

    const handleAgentResponse = (data) => {
      // Remove any loading message
      dispatch(chatAction.popChat());

      // Format the response to clean, professional style
      const formattedResultText = formatResponse(data, data.question || "");

      // Build the HTML for display in support documentation style
      const formattedResult = `
        <div class="support-doc-results">
          <div class="support-content-wrapper">
            <div class="support-main-content">
              <div class="support-answer">
                ${formattedResultText}
              </div>
            </div>
          </div>
        </div>
      `;

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

      // End loading states
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));
      dispatch(agentAction.clearActiveTask());

      // Call the onComplete callback
      if (onComplete && typeof onComplete === "function") {
        onComplete(data);
      }

      // Update local state
      setIsPolling(false);
      setPollCount(attemptCount);
    };

    const handlePollError = (error) => {
      console.error("Polling error:", error);
      setPollError(error);

      // Show clean error in chat
      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: "Agent query",
            gemini: `
              <div class="support-doc-results">
                <div class="support-content-wrapper">
                  <div class="support-main-content">
                    <div class="support-answer">
                      <h2>Unable to retrieve information</h2>
                      <p>Sorry, I couldn't retrieve the information you requested. Please try again later or rephrase your question.</p>
                      <p class="note">If you continue to experience issues, please contact support with reference code: ${Date.now()
                        .toString(36)
                        .slice(-6)
                        .toUpperCase()}</p>
                    </div>
                  </div>
                </div>
              </div>
            `,
            isLoader: "no",
            isSearch: true,
          },
        })
      );

      // End loading
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));
      dispatch(agentAction.clearActiveTask());

      // Call the onComplete callback
      if (onComplete && typeof onComplete === "function") {
        onComplete({ error });
      }

      // Update local state
      setIsPolling(false);
      setPollCount(attemptCount);
    };

    const pollAgentStatus = async () => {
      if (!isPolling || attemptCount >= maxPolls) {
        return;
      }

      attemptCount++;
      setPollCount(attemptCount);

      try {
        const response = await fetch("/api/proxy-agent-poll", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            agentId,
            taskId,
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const data = await response.json();
        console.log(`Poll ${attemptCount} response:`, data);

        if (data.status === "complete" || data.status === "success") {
          // Success - process the response
          handleAgentResponse(data);
        } else if (attemptCount >= maxPolls) {
          // Max attempts reached - timeout
          handleAgentResponse({
            result:
              "Sorry, it's taking longer than expected to retrieve this information. Please try again later.",
            question: "Agent query",
            status: "timeout",
          });
        } else {
          // Schedule next poll
          pollTimer = setTimeout(pollAgentStatus, pollInterval);
        }
      } catch (error) {
        console.error(`Poll ${attemptCount} error:`, error);

        if (attemptCount >= maxPolls) {
          handlePollError(error);
        } else {
          // Retry on next interval
          pollTimer = setTimeout(pollAgentStatus, pollInterval);
        }
      }
    };

    // Start polling immediately
    pollAgentStatus();

    // Cleanup function
    return () => {
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
      setIsPolling(false);
    };
  }, [agentId, taskId, endpoint, token, dispatch, onComplete]);

  // This component doesn't render anything
  return null;
};

export default AgentPollingManager;
