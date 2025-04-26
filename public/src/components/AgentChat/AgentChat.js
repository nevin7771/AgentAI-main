// public/src/components/AgentChat/AgentChat.js
import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import styles from "./AgentChat.module.css";
import AgentSelector from "./AgentSelector";
import { sendAgentQuestion } from "../../store/agent-actions";
import { useAgent } from "./AgentProvider";

const AgentChat = () => {
  const dispatch = useDispatch();
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);

  // Get agent context data
  const { selectedAgents } = useAgent();

  // Handle input change
  const userInputHandler = (e) => {
    setUserInput(e.target.value);
  };

  // Handle form submission
  const onSubmitHandler = async (e) => {
    e.preventDefault();

    if (!userInput.trim()) return;
    if (selectedAgents.length === 0) {
      alert("Please select at least one agent");
      return;
    }

    setIsProcessing(true);
    setProcessingStatus("Sending question to agents...");

    try {
      // Submit the question to selected agents
      const result = await dispatch(
        sendAgentQuestion({
          question: userInput,
          agents: selectedAgents,
          chatHistoryId,
        })
      );

      // Handle the response
      if (result && result.taskId) {
        // Poll for the response
        pollForResponse(result.taskId);
      } else {
        setIsProcessing(false);
        alert("Failed to send question to agents");
      }
    } catch (error) {
      console.error("Error sending question:", error);
      setIsProcessing(false);
      alert("An error occurred while sending your question");
    }
  };

  // Poll for the response using the taskId
  const pollForResponse = async (taskId) => {
    let attempts = 0;
    const maxAttempts = 30; // Maximum 30 attempts (5 minutes total)
    const pollInterval = 10000; // Poll every 10 seconds

    const poll = async () => {
      try {
        setProcessingStatus(
          `Waiting for agent responses... (${attempts + 1}/${maxAttempts})`
        );

        const response = await fetch(`/api/agent-response/${taskId}`, {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to get response");
        }

        const data = await response.json();

        if (data.status === "complete") {
          // Success! We have the response
          setProcessingStatus("Response received!");
          setIsProcessing(false);
          setUserInput("");

          // The response is already handled by the action creator
          return;
        }

        // Still pending
        attempts++;

        if (attempts >= maxAttempts) {
          // Timeout
          setIsProcessing(false);
          alert("Timed out waiting for agent response");
          return;
        }

        // Update status with completion information
        if (data.completedAgents && data.pendingAgents) {
          const completed = data.completedAgents.length;
          const total = completed + data.pendingAgents.length;
          setProcessingStatus(
            `Received ${completed}/${total} agent responses...`
          );
        }

        // Continue polling
        setTimeout(poll, pollInterval);
      } catch (error) {
        console.error("Error polling for response:", error);
        setIsProcessing(false);
        alert("Error retrieving agent response");
      }
    };

    // Start polling
    poll();
  };

  return (
    <div className={styles["agent-chat-container"]}>
      {/* Agent selector component */}
      <AgentSelector />

      {/* Input form */}
      <form onSubmit={onSubmitHandler} className={styles["input-form"]}>
        <input
          value={userInput}
          onChange={userInputHandler}
          placeholder="Ask agents a question..."
          className={styles["input-field"]}
          disabled={isProcessing}
        />
        <button
          type="submit"
          className={styles["send-btn"]}
          disabled={
            isProcessing || !userInput.trim() || selectedAgents.length === 0
          }>
          {isProcessing ? (
            <span className={styles["loading-spinner"]}></span>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
      </form>

      {/* Processing indicator */}
      {isProcessing && (
        <div className={styles["processing-indicator"]}>
          <div className={styles["processing-spinner"]}></div>
          <p>{processingStatus}</p>
        </div>
      )}

      {/* Agent selection indicator */}
      {selectedAgents.length > 0 && (
        <div className={styles["selected-agents"]}>
          <p>Selected Agents: {selectedAgents.length}</p>
          <div className={styles["agent-tags"]}>
            {selectedAgents.map((agentId) => (
              <span key={agentId} className={styles["agent-tag"]}>
                {agentId}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* JWT Status Indicator - Shows whether we have a valid token */}
      <JwtStatusIndicator />
    </div>
  );
};

// JWT Status Indicator Component
const JwtStatusIndicator = () => {
  const { jwtToken, jwtExpiry } = useAgent();
  const [status, setStatus] = useState("none"); // 'valid', 'expired', 'none'

  useEffect(() => {
    const checkStatus = () => {
      if (!jwtToken || !jwtExpiry) {
        setStatus("none");
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (now >= jwtExpiry) {
        setStatus("expired");
      } else if (jwtExpiry - now < 300) {
        // Less than 5 minutes remaining
        setStatus("expiring");
      } else {
        setStatus("valid");
      }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 30000); // Check every 30 seconds

    return () => clearInterval(intervalId);
  }, [jwtToken, jwtExpiry]);

  // Only show in development environment
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <div className={`${styles["jwt-status"]} ${styles[`jwt-${status}`]}`}>
      <div className={styles["jwt-icon"]}>
        {status === "valid" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
              fill="currentColor"
            />
          </svg>
        )}
        {(status === "expired" || status === "expiring") && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5.99L19.53 19H4.47L12 5.99M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2v-4z"
              fill="currentColor"
            />
          </svg>
        )}
        {status === "none" && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"
              fill="currentColor"
            />
          </svg>
        )}
      </div>
      <span>
        {status === "valid" && "JWT: Valid"}
        {status === "expired" && "JWT: Expired"}
        {status === "expiring" && "JWT: Expiring Soon"}
        {status === "none" && "JWT: Not Available"}
      </span>
    </div>
  );
};

export default AgentChat;
