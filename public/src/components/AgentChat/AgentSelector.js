// public/src/components/AgentChat/AgentSelector.js
import React, { useState, useEffect } from "react";
import styles from "./AgentSelector.module.css";
import { useDispatch, useSelector } from "react-redux";
import { agentAction } from "../../store/agent";
import { fetchAvailableAgents } from "../../store/agent-actions";

const AgentSelector = () => {
  const dispatch = useDispatch();
  const agents = useSelector((state) => state.agent.agents);
  const selectedAgents = useSelector((state) => state.agent.selectedAgents);
  const isLoading = useSelector((state) => state.agent.isLoading);
  const error = useSelector((state) => state.agent.error);

  const [isOpen, setIsOpen] = useState(false);

  // Fetch available agents on component mount
  useEffect(() => {
    dispatch(fetchAvailableAgents());
  }, [dispatch]);

  // Toggle agent selection
  const toggleAgent = (agentId) => {
    if (selectedAgents.includes(agentId)) {
      dispatch(agentAction.removeSelectedAgent(agentId));
    } else {
      dispatch(agentAction.addSelectedAgent(agentId));
    }
  };

  // Toggle dropdown
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // Select all agents
  const selectAllAgents = () => {
    dispatch(agentAction.setSelectedAgents(agents.map((agent) => agent.id)));
  };

  // Clear all selections
  const clearSelections = () => {
    dispatch(agentAction.clearSelectedAgents());
  };

  return (
    <div className={styles["agent-selector"]}>
      <div className={styles["selector-toggle"]} onClick={toggleDropdown}>
        <span className={styles["toggle-text"]}>
          {selectedAgents.length > 0
            ? `${selectedAgents.length} Agent${
                selectedAgents.length > 1 ? "s" : ""
              } Selected`
            : "Select Agents"}
        </span>
        <span
          className={`${styles["toggle-arrow"]} ${
            isOpen ? styles["open"] : ""
          }`}>
          ▼
        </span>
      </div>

      {isOpen && (
        <div className={styles["dropdown-content"]}>
          <div className={styles["dropdown-header"]}>
            <h4>Select AI Agents</h4>
            <div className={styles["dropdown-actions"]}>
              <button
                className={styles["select-all-btn"]}
                onClick={selectAllAgents}
                disabled={
                  agents.length === selectedAgents.length || agents.length === 0
                }>
                Select All
              </button>
              <button
                className={styles["clear-btn"]}
                onClick={clearSelections}
                disabled={selectedAgents.length === 0}>
                Clear
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className={styles["loading-indicator"]}>
              <div className={styles["loading-spinner"]}></div>
              <p>Loading agents...</p>
            </div>
          ) : error ? (
            <div className={styles["error-message"]}>
              <p>{error}</p>
            </div>
          ) : (
            <div className={styles["agents-list"]}>
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`${styles["agent-item"]} ${
                    selectedAgents.includes(agent.id) ? styles["selected"] : ""
                  }`}
                  onClick={() => toggleAgent(agent.id)}>
                  <div className={styles["agent-checkbox"]}>
                    {selectedAgents.includes(agent.id) && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </div>
                  <div className={styles["agent-info"]}>
                    <span className={styles["agent-name"]}>{agent.name}</span>
                    <span className={styles["agent-description"]}>
                      {agent.description}
                    </span>
                  </div>
                </div>
              ))}

              {agents.length === 0 && (
                <div className={styles["no-agents"]}>
                  <p>No agents available</p>
                </div>
              )}
            </div>
          )}

          {/* JWT Token Status - only show in development */}
          {process.env.NODE_ENV === "development" && <JwtStatus />}
        </div>
      )}
    </div>
  );
};

// JWT Status component
const JwtStatus = () => {
  const jwtToken = useSelector((state) => state.agent.jwtToken);
  const jwtExpiry = useSelector((state) => state.agent.jwtExpiry);
  const [status, setStatus] = useState("none");

  useEffect(() => {
    const checkStatus = () => {
      if (!jwtToken || !jwtExpiry) {
        setStatus("none");
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (now >= jwtExpiry) {
        setStatus("expired");
      } else {
        setStatus("valid");
      }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 30000);

    return () => clearInterval(intervalId);
  }, [jwtToken, jwtExpiry]);

  if (status === "none") {
    return (
      <div className={styles["jwt-status"]}>
        <span className={styles["jwt-status-icon"]}>⚠️</span>
        <span className={styles["jwt-status-text"]}>JWT: Not available</span>
      </div>
    );
  }

  if (status === "expired") {
    return (
      <div className={`${styles["jwt-status"]} ${styles["jwt-expired"]}`}>
        <span className={styles["jwt-status-icon"]}>⚠️</span>
        <span className={styles["jwt-status-text"]}>JWT: Expired</span>
      </div>
    );
  }

  return (
    <div className={`${styles["jwt-status"]} ${styles["jwt-valid"]}`}>
      <span className={styles["jwt-status-icon"]}>✓</span>
      <span className={styles["jwt-status-text"]}>JWT: Valid</span>
    </div>
  );
};

export default AgentSelector;
