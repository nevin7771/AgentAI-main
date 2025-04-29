// public/src/components/AgentChat/AgentChat.js
import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import styles from "./AgentChat.module.css";
import AgentSelector from "./AgentSelector";
import {
  sendAgentQuestion,
  pollAgentResponse,
  fetchAvailableAgents,
} from "../../store/agent-actions";
import { useAgent } from "./AgentProvider";
import { useNavigate } from "react-router-dom";

const AgentChat = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [userInput, setUserInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState(null);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);

  // Get agent context data
  const { selectedAgents } = useAgent();

  // Check server connection on component mount
  useEffect(() => {
    // Clear any previous errors
    setError(null);

    // Try to fetch available agents to check if server is up
    dispatch(fetchAvailableAgents()).catch((err) => {
      console.error("Server connection error:", err);
      setError(
        "Can't connect to server. Check if the server is running at the correct address."
      );
    });
  }, [dispatch]);

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

    // Clear any previous errors
    setError(null);
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
        // Start polling for the response
        pollForResponse(result.taskId);
      } else {
        setIsProcessing(false);
        setError("Failed to send question to agents");
      }
    } catch (error) {
      console.error("Error sending question:", error);
      setIsProcessing(false);
      setProcessingStatus("");
      setError(error.message || "Error sending question to agents");
    }
  };

  // Poll for the response using the taskId
  const pollForResponse = async (taskId) => {
    let attempts = 0;
    const maxAttempts = 30; // Maximum 30 attempts (5 minutes total)
    const pollInterval = 3000; // Poll every 3 seconds

    // Immediately add loading indicator to chat
    navigate("/app"); // Go to main chat page to show loading

    const poll = async () => {
      try {
        attempts++;
        setProcessingStatus(
          `Waiting for agent responses... (${attempts}/${maxAttempts})`
        );

        const data = await dispatch(pollAgentResponse(taskId));
        console.log("Poll attempt", attempts, "received data:", data);

        if (data && data.status === "complete") {
          // Success! We have the response
          setProcessingStatus("Response received!");
          setIsProcessing(false);
          setUserInput("");

          // Navigate to the appropriate chat page
          if (data.chatHistoryId) {
            navigate(`/app/${data.chatHistoryId}`);
          } else {
            navigate("/app");
          }
          return;
        }

        // Still pending
        if (attempts >= maxAttempts) {
          // Timeout
          setIsProcessing(false);
          setProcessingStatus("");
          setError("Timed out waiting for agent response");
          return;
        }

        // Update status with completion information if available
        if (data && data.completedAgents && data.pendingAgents) {
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
        setProcessingStatus("");
        setError(error.message || "Error retrieving agent response");
      }
    };

    // Start polling
    poll();
  };

  return (
    <div className={styles["agent-chat-container"]}>
      {/* Agent selector component */}
      <AgentSelector />

      {/* Error message */}
      {error && (
        <div className={styles["error-message"]}>
          <p>{error}</p>
          <p className={styles["error-hint"]}>
            Make sure your server is running and accessible
          </p>
        </div>
      )}

      {/* Input form */}
      <form onSubmit={onSubmitHandler} className={styles["input-form"]}>
        <input
          value={userInput}
          onChange={userInputHandler}
          placeholder="Ask agents a question..."
          className={styles["input-field"]}
          disabled={isProcessing || error !== null}
        />
        <button
          type="submit"
          className={styles["send-btn"]}
          disabled={
            isProcessing ||
            !userInput.trim() ||
            selectedAgents.length === 0 ||
            error !== null
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
      {selectedAgents.length > 0 && !error && (
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
    </div>
  );
};

export default AgentChat;
