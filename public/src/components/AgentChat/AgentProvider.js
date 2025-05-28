// public/src/components/AgentChat/AgentProvider.js - UPDATED FOR PRODUCTION
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

// Helper function to get the correct API URL
const getApiUrl = (endpoint) => {
  // In production, always use relative paths (goes through proxy)
  if (process.env.NODE_ENV === "production") {
    return endpoint;
  }

  // In development, use the configured server endpoint
  const serverEndpoint =
    process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
  return `${serverEndpoint}${endpoint}`;
};

// Helper function to make API calls with proper error handling
const makeApiCall = async (endpoint, options = {}) => {
  const url = getApiUrl(endpoint);
  const defaultOptions = {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  console.log(`[API] Making request to: ${url}`);

  try {
    const response = await fetch(url, defaultOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[API] Success for ${endpoint}:`, data);
    return data;
  } catch (error) {
    console.error(`[API] Error for ${endpoint}:`, error);
    throw error;
  }
};

const AgentProvider = ({ children }) => {
  const dispatch = useDispatch();
  const agentState = useSelector((state) => state.agent);

  // Effect for fetching available agents on mount
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        dispatch(agentAction.setLoading(true));
        console.log("Fetching available agents...");

        // Try to fetch agents from API
        const data = await makeApiCall("/api/available-agents");

        if (data.success && data.agents && data.agents.length > 0) {
          console.log("Successfully fetched agents:", data.agents);
          dispatch(agentAction.setAgents(data.agents));
        } else {
          throw new Error("No agents returned from API");
        }
      } catch (error) {
        console.error("Error fetching agents:", error);
        dispatch(agentAction.setError(error.message));

        // Set fallback agents for development/testing
        console.log("Using fallback agent list");
        dispatch(
          agentAction.setAgents([
            {
              id: "client_agent",
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
              id: "monitor_ag",
              name: "Monitor Agent",
              description: "Monitor base search",
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
          console.log("Attempting to refresh JWT token...");

          try {
            const data = await makeApiCall("/api/generate-jwt", {
              method: "POST",
            });

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
              return;
            } else {
              throw new Error("Invalid token response");
            }
          } catch (error) {
            console.error("Error refreshing JWT token:", error);

            // Only use fallback token in development
            if (process.env.NODE_ENV === "development") {
              console.log("Using development fallback token");
              const fakeToken =
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkRldiBVc2VyIiwiaWF0IjoxNTE2MjM5MDIyfQ.L8i6g3PfcHlioHCCPURC9pmXT7gdJpx3kOoyAfNUwCc";
              const fakeExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour

              dispatch(
                agentAction.setJwtToken({
                  token: fakeToken,
                  expiry: fakeExpiry,
                })
              );

              localStorage.setItem("agent_token", fakeToken);
              console.log(
                "Using development fallback token, expires:",
                new Date(fakeExpiry * 1000).toLocaleTimeString()
              );
            } else {
              // In production, don't use fallback tokens
              dispatch(
                agentAction.setError("Failed to get authentication token")
              );
            }
          }
        }
      } catch (error) {
        console.error("Error in JWT token refresh process:", error);
        dispatch(agentAction.setError("Authentication error"));
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
