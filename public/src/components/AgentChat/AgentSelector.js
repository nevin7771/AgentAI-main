import React, { useState, useEffect, useRef, useCallback } from "react";
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
  const selectorRef = useRef(null); // FIXED: Ref for entire selector

  // Fetch available agents on component mount
  useEffect(() => {
    dispatch(fetchAvailableAgents()).catch((err) => {
      console.error("Error in fetchAvailableAgents effect:", err);
    });
  }, [dispatch]);

  // FIXED: Improved auto-close functionality
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      // Check if click is outside the entire selector component
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        console.log("[AgentSelector] Closing dropdown - outside click");
        setIsOpen(false);
      }
    };

    const handleEscapeKey = (event) => {
      if (event.key === "Escape") {
        console.log("[AgentSelector] Closing dropdown - escape key");
        setIsOpen(false);
      }
    };

    // FIXED: Use document instead of window for better detection
    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("keydown", handleEscapeKey, true);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscapeKey, true);
    };
  }, [isOpen]);

  // Mock function to ensure Monitor agent is added if not present in response
  useEffect(() => {
    if (agents && agents.length > 0) {
      const hasMonitorAgent = agents.some((agent) => agent.id === "monitor_ag");

      if (!hasMonitorAgent) {
        const updatedAgents = [...agents];
        updatedAgents.push({
          id: "monitor_ag",
          name: "Monitor Agent",
          description: "Search logs and monitor data",
        });
        dispatch(agentAction.setAgents(updatedAgents));
      }
    }
  }, [agents, dispatch]);

  // FIXED: Enhanced agent selection with reliable auto-close
  const toggleAgent = useCallback(
    (agentId) => {
      try {
        console.log(`[AgentSelector] Selecting agent: ${agentId}`);

        if (selectedAgents.includes(agentId)) {
          // If clicking the same agent, deselect it
          dispatch(agentAction.removeSelectedAgent(agentId));
        } else {
          // Clear all selected agents first, then select the new one
          dispatch(agentAction.clearSelectedAgents());
          dispatch(agentAction.addSelectedAgent(agentId));
        }

        // FIXED: Immediate close with proper timing
        console.log("[AgentSelector] Auto-closing dropdown after selection");
        setTimeout(() => {
          setIsOpen(false);
        }, 150); // Reduced delay for better UX
      } catch (err) {
        console.error("Error in toggleAgent:", err);
      }
    },
    [selectedAgents, dispatch]
  );

  // FIXED: Enhanced dropdown toggle
  const toggleDropdown = useCallback(
    (event) => {
      event.stopPropagation(); // Prevent event bubbling
      console.log(`[AgentSelector] Toggling dropdown: ${!isOpen}`);
      setIsOpen(!isOpen);
    },
    [isOpen]
  );

  // Clear all selections
  const clearSelections = useCallback(() => {
    try {
      console.log("[AgentSelector] Clearing all selections");
      dispatch(agentAction.clearSelectedAgents());
      // Don't auto-close for clear action - user might want to select another
    } catch (err) {
      console.error("Error in clearSelections:", err);
    }
  }, [dispatch]);

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

    return `${selectedAgents.length} Agents Selected`;
  };

  return (
    <div className={styles["agent-selector"]} ref={selectorRef}>
      <div
        className={styles["selector-toggle"]}
        onClick={toggleDropdown}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleDropdown(e);
          }
        }}>
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
                      agent.id === "conf_ag" ||
                      agent.id === "monitor_ag" ||
                      agent.id === "jira_ag"
                        ? styles["day-one-agent"]
                        : ""
                    }`}
                    onClick={() => toggleAgent(agent.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleAgent(agent.id);
                      }
                    }}>
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
                          agent.id === "monitor_ag" ||
                          agent.id === "jira_ag") && (
                          <span className={styles["streaming-badge"]}>
                            {agent.id === "jira_ag" ? "Smart" : "Streaming"}
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

// JWT Status component (unchanged)
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
