import React, { useState, useEffect } from "react";
import styles from "./AgentSelector.module.css";
import { useDispatch, useSelector } from "react-redux";
import { agentAction } from "../../store/agent";
import { fetchAvailableAgents } from "../../store/agent-actions";

const AgentSelector = () => {
  const dispatch = useDispatch();
  const agents = useSelector((state) => state.agent.agents);
  const selectedAgents = useSelector(
    (state) => state.agent?.selectedAgents || []
  );

  const isLoading = useSelector((state) => state.agent.isLoading);
  const error = useSelector((state) => state.agent.error);

  const [isOpen, setIsOpen] = useState(false);

  // Fetch available agents on component mount
  useEffect(() => {
    dispatch(fetchAvailableAgents()).catch((err) => {
      console.error("Error in fetchAvailableAgents effect:", err);
    });
  }, [dispatch]);

  // Mock function to ensure Monitor agent is added if not present in response
  useEffect(() => {
    if (agents && agents.length > 0) {
      const hasConfluenceAgent = agents.some((agent) => agent.id === "conf_ag");
      const hasMonitorAgent = agents.some((agent) => agent.id === "monitor_ag");

      // If we have agents but no Monitor agent, add it
      if (!hasMonitorAgent) {
        const updatedAgents = [...agents];

        // Add the Monitor agent (if not found)
        updatedAgents.push({
          id: "monitor_ag",
          name: "Monitor Agent",
          description: "Search logs and monitor data",
        });

        dispatch(agentAction.setAgents(updatedAgents));
      }
    }
  }, [agents, dispatch]);

  // Toggle agent selection - UPDATED: Only allow one agent at a time
  const toggleAgent = (agentId) => {
    try {
      if (selectedAgents.includes(agentId)) {
        // If clicking the same agent, deselect it
        dispatch(agentAction.removeSelectedAgent(agentId));
      } else {
        // Clear all selected agents first, then select the new one
        dispatch(agentAction.clearSelectedAgents());
        dispatch(agentAction.addSelectedAgent(agentId));
      }
    } catch (err) {
      console.error("Error in toggleAgent:", err);
    }
  };

  // Toggle dropdown
  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  // REMOVED: Select all agents function (no longer needed)

  // Clear all selections
  const clearSelections = () => {
    try {
      dispatch(agentAction.clearSelectedAgents());
    } catch (err) {
      console.error("Error in clearSelections:", err);
    }
  };

  // Safely get the count of agents
  const agentCount = Array.isArray(agents) ? agents.length : 0;

  // Function to get the display name of the selected agent
  const getSelectedAgentName = () => {
    if (selectedAgents.length === 0) return "Select an Agent";

    if (selectedAgents.length === 1) {
      const selectedAgentId = selectedAgents[0];
      const selectedAgent = agents.find(
        (agent) => agent.id === selectedAgentId
      );
      return selectedAgent
        ? `${selectedAgent.name} Selected`
        : `Agent Selected`;
    }

    // This shouldn't happen with single selection, but just in case
    return `${selectedAgents.length} Agents Selected`;
  };

  return (
    <div className={styles["agent-selector"]}>
      <div className={styles["selector-toggle"]} onClick={toggleDropdown}>
        <span className={styles["toggle-text"]}>{getSelectedAgentName()}</span>
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
            <h4>Select AI Agent</h4>
            <div className={styles["dropdown-actions"]}>
              {/* REMOVED: Select All button since we only allow one agent */}
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
              {agents && agents.length > 0 ? (
                agents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`${styles["agent-item"]} ${
                      selectedAgents.includes(agent.id)
                        ? styles["selected"]
                        : ""
                    } ${
                      agent.id === "conf_ag" || agent.id === "monitor_ag"
                        ? styles["day-one-agent"]
                        : ""
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
                      <span className={styles["agent-name"]}>
                        {agent.name}
                        {(agent.id === "conf_ag" ||
                          agent.id === "monitor_ag") && (
                          <span className={styles["streaming-badge"]}>
                            Streaming
                          </span>
                        )}
                      </span>
                      <span className={styles["agent-description"]}>
                        {agent.description}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
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
