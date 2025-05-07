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
  const [isProcessing, setIsProcessing] = useState(false); // Local loading on this component
  const [processingStatus, setProcessingStatus] = useState("");
  const [error, setError] = useState(null);
  const chatHistoryIdFromState = useSelector(
    (state) => state.chat.chatHistoryId
  ); // Current chat ID if on /app/:id

  const { selectedAgents } = useAgent();

  useEffect(() => {
    setError(null);
    dispatch(fetchAvailableAgents()).catch((err) => {
      console.error("Server connection error:", err);
      setError(
        "Can't connect to server. Check if the server is running at the correct address."
      );
    });
  }, [dispatch]);

  const userInputHandler = (e) => {
    setUserInput(e.target.value);
  };

  const onSubmitHandler = async (e) => {
    e.preventDefault();

    if (!userInput.trim()) return;
    if (selectedAgents.length === 0) {
      alert("Please select at least one agent");
      return;
    }

    setError(null);
    setIsProcessing(true); // Show local loading briefly
    setProcessingStatus("Initiating request...");

    const isOrchestratedAgent =
      selectedAgents.includes("jira_ag") || selectedAgents.includes("conf_ag");

    // For orchestrated agents (Jira, Confluence), navigate to /app immediately.
    // The sendAgentQuestion action will add a loading message to the chat list there.
    if (isOrchestratedAgent) {
      navigate("/app"); // Navigate to the main chat view. sendAgentQuestion will populate it.
    }
    // For polling agents, pollForResponse will handle navigation after task ID is received.

    try {
      const result = await dispatch(
        sendAgentQuestion({
          question: userInput,
          agents: selectedAgents,
          chatHistoryId: chatHistoryIdFromState, // Pass current chat ID from state
        })
      );

      setIsProcessing(false); // Stop local loading on this component
      setProcessingStatus("");

      if (result && result.success) {
        setUserInput(""); // Clear input on success

        // If orchestrated and a new/specific chatHistoryId was determined by sendAgentQuestion,
        // ensure the URL reflects it. User is already on /app.
        if (
          isOrchestratedAgent &&
          result.chatHistoryId &&
          result.chatHistoryId !== chatHistoryIdFromState
        ) {
          navigate(`/app/${result.chatHistoryId}`, { replace: true });
        }
        // For polling agents, pollForResponse (called if result.taskId exists) handles final navigation.
        else if (result.taskId && !isOrchestratedAgent) {
          pollForResponse(result.taskId); // This will also navigate to /app or /app/id
        }
      } else {
        setError(result?.error || "Failed to process agent request.");
        // If orchestrated, error is shown in chat on /app. If polling, error shown here.
        if (isOrchestratedAgent) {
          // User is on /app, error message should be in the chat list by sendAgentQuestion
        } else {
          setIsProcessing(false); // Ensure local loading stops for polling errors too
        }
      }
    } catch (error) {
      console.error("Error in onSubmitHandler:", error);
      setIsProcessing(false);
      setProcessingStatus("");
      setError(error.message || "An unexpected error occurred.");
      // If orchestrated, user is on /app, error should be in chat.
    }
  };

  // Poll for the response using the taskId (for non-orchestrated agents)
  const pollForResponse = async (taskId) => {
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 3000;

    // Navigate to /app to show loading in chat list for polling agents
    // This is now handled by onSubmitHandler for orchestrated,
    // but pollForResponse is for non-orchestrated, so it should also navigate.
    navigate("/app");

    const poll = async () => {
      try {
        attempts++;
        // Update local processing status if needed, though user is now on /app
        // setProcessingStatus(`Waiting for agent responses... (${attempts}/${maxAttempts})`);

        const data = await dispatch(pollAgentResponse(taskId));
        console.log("Poll attempt", attempts, "received data:", data);

        if (data && data.status === "complete") {
          // setProcessingStatus("Response received!");
          // setIsProcessing(false); // Local processing on AgentChat page is done
          // setUserInput(""); // Input already cleared

          if (data.chatHistoryId) {
            navigate(`/app/${data.chatHistoryId}`, { replace: true });
          } else {
            navigate("/app", { replace: true }); // Fallback
          }
          return;
        }

        if (attempts >= maxAttempts) {
          // setError("Timed out waiting for agent response");
          // Error will be shown in chat on /app by pollAgentResponse action
          return;
        }
        setTimeout(poll, pollInterval);
      } catch (error) {
        console.error("Error polling for response:", error);
        // setError(error.message || "Error retrieving agent response");
        // Error will be shown in chat on /app by pollAgentResponse action
      }
    };
    poll();
  };

  return (
    <div className={styles["agent-chat-container"]}>
      <AgentSelector />
      {error && !isProcessing && (
        <div className={styles["error-message"]}>
          <p>{error}</p>
        </div>
      )}
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
      {isProcessing && (
        <div className={styles["processing-indicator"]}>
          <div className={styles["processing-spinner"]}></div>
          <p>{processingStatus}</p>
        </div>
      )}
      {selectedAgents.length > 0 && !error && (
        <div className={styles["selected-agents"]}>
          <p>Selected Agents: {selectedAgents.length}</p>
          {/* <div className={styles["agent-tags"]}>
            {selectedAgents.map((agentId) => (
              <span key={agentId} className={styles["agent-tag"]}>
                {agentId}
              </span>
            ))}
          </div> */}
        </div>
      )}
    </div>
  );
};

export default AgentChat;
