// public/src/components/AgentChat/AgentProvider.js
import React, { useEffect, createContext, useContext } from "react";
import { useDispatch, useSelector } from "react-redux";
import { agentAction } from "../../store/agent";

// Create context for agent data
export const AgentContext = createContext({
  agents: [],
  selectedAgents: [],
  jwtToken: null,
  jwtExpiry: null,
  isLoading: false,
  error: null,
  selectAgent: () => {},
  deselectAgent: () => {},
  selectAllAgents: () => {},
  clearSelectedAgents: () => {},
});

// Custom hook to use the agent context
export const useAgent = () => useContext(AgentContext);

// JWT token refresh interval in milliseconds (5 minutes)
const JWT_REFRESH_INTERVAL = 5 * 60 * 1000;

const AgentProvider = ({ children }) => {
  const dispatch = useDispatch();
  const agentState = useSelector((state) => state.agent);

  // Effect for fetching available agents on mount
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        dispatch(agentAction.setLoading(true));

        const response = await fetch("/api/available-agents", {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch available agents");
        }

        const data = await response.json();

        if (data.success && data.agents) {
          dispatch(agentAction.setAgents(data.agents));
        } else {
          throw new Error(data.error || "Failed to get agent list");
        }
      } catch (error) {
        console.error("Error fetching agents:", error);
        dispatch(agentAction.setError(error.message));

        // Set fallback agents for development/testing
        dispatch(
          agentAction.setAgents([
            {
              id: "z_oGA",
              name: "Client Agent",
              description: "Client-related questions",
            },
            {
              id: "zr_ag",
              name: "ZR Agent",
              description: "Zoom Room questions",
            },
            {
              id: "jira_ag",
              name: "Jira Agent",
              description: "Jira tickets and issues",
            },
            {
              id: "conf_ag",
              name: "Confluence Agent",
              description: "Knowledge base search",
            },
            {
              id: "zp_ag",
              name: "ZP Agent",
              description: "Zoom Phone support",
            },
          ])
        );
      } finally {
        dispatch(agentAction.setLoading(false));
      }
    };

    fetchAgents();
  }, [dispatch]);

  // Effect for JWT token management
  useEffect(() => {
    // Function to generate or refresh JWT token
    const refreshJwtToken = async () => {
      try {
        // Check if we need a new token
        const now = Math.floor(Date.now() / 1000);
        const needsRefresh =
          !agentState.jwtToken ||
          !agentState.jwtExpiry ||
          agentState.jwtExpiry - now < 300; // Less than 5 minutes remaining

        if (needsRefresh) {
          const response = await fetch("/api/generate-jwt", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error("Failed to generate JWT token");
          }

          const data = await response.json();

          if (data.success && data.token) {
            dispatch(
              agentAction.setJwtToken({
                token: data.token,
                expiry: data.expiresAt,
              })
            );
            console.log(
              "JWT token refreshed, expires:",
              new Date(data.expiresAt * 1000).toLocaleTimeString()
            );
          } else {
            throw new Error(data.error || "Invalid token response");
          }
        }
      } catch (error) {
        console.error("Error refreshing JWT token:", error);
        dispatch(agentAction.setError("Failed to get authentication token"));
      }
    };

    // Initial token generation
    refreshJwtToken();

    // Set up interval for token refresh
    const intervalId = setInterval(refreshJwtToken, JWT_REFRESH_INTERVAL);

    // Clean up on unmount
    return () => clearInterval(intervalId);
  }, [dispatch, agentState.jwtToken, agentState.jwtExpiry]);

  // Handler functions for agent selection
  const selectAgent = (agentId) => {
    dispatch(agentAction.addSelectedAgent(agentId));
  };

  const deselectAgent = (agentId) => {
    dispatch(agentAction.removeSelectedAgent(agentId));
  };

  const selectAllAgents = () => {
    dispatch(
      agentAction.setSelectedAgents(agentState.agents.map((agent) => agent.id))
    );
  };

  const clearSelectedAgents = () => {
    dispatch(agentAction.clearSelectedAgents());
  };

  // Context value
  const contextValue = {
    agents: agentState.agents,
    selectedAgents: agentState.selectedAgents,
    jwtToken: agentState.jwtToken,
    jwtExpiry: agentState.jwtExpiry,
    isLoading: agentState.isLoading,
    error: agentState.error,
    selectAgent,
    deselectAgent,
    selectAllAgents,
    clearSelectedAgents,
  };

  return (
    <AgentContext.Provider value={contextValue}>
      {children}
    </AgentContext.Provider>
  );
};

export default AgentProvider;
