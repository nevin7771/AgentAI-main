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
        console.log("Fetching available agents...");

        // First try with proxy path
        try {
          const proxyResponse = await fetch("/api/available-agents", {
            credentials: "include",
            headers: {
              'Accept': 'application/json',
            },
          });
          
          if (proxyResponse.ok) {
            const data = await proxyResponse.json();
            
            if (data.success && data.agents && data.agents.length > 0) {
              console.log("Successfully fetched agents via proxy:", data.agents);
              dispatch(agentAction.setAgents(data.agents));
              dispatch(agentAction.setLoading(false));
              return;
            }
          } else {
            console.warn(`Proxy response not OK: ${proxyResponse.status} ${proxyResponse.statusText}`);
          }
        } catch (proxyError) {
          console.error("Error fetching agents via proxy:", proxyError);
        }

        // If proxy fails, try direct URL
        console.log("Proxy fetch failed, trying direct URL...");
        const SERVER_ENDPOINT = process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
        
        try {
          const directResponse = await fetch(`${SERVER_ENDPOINT}/api/available-agents`, {
            credentials: "include",
            headers: {
              'Accept': 'application/json',
            },
          });

          if (directResponse.ok) {
            const data = await directResponse.json();
            
            if (data.success && data.agents) {
              console.log("Successfully fetched agents via direct URL:", data.agents);
              dispatch(agentAction.setAgents(data.agents));
              dispatch(agentAction.setLoading(false));
              return;
            }
          } else {
            console.warn(`Direct response not OK: ${directResponse.status} ${directResponse.statusText}`);
          }
        } catch (directError) {
          console.error("Error fetching agents via direct URL:", directError);
        }

        // If both attempts fail, use fallback agents
        throw new Error("Failed to fetch agents from server");
        
      } catch (error) {
        console.error("Error fetching agents (all methods failed):", error);
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
          
          // Try proxy first
          try {
            const proxyResponse = await fetch("/api/generate-jwt", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              credentials: "include",
            });

            if (proxyResponse.ok) {
              const data = await proxyResponse.json();

              if (data.success && data.token) {
                dispatch(
                  agentAction.setJwtToken({
                    token: data.token,
                    expiry: data.expiresAt,
                  })
                );
                console.log(
                  "JWT token refreshed via proxy, expires:",
                  new Date(data.expiresAt * 1000).toLocaleTimeString()
                );
                return;
              }
            } else {
              console.warn(`Proxy token response not OK: ${proxyResponse.status}`);
            }
          } catch (proxyError) {
            console.error("Error refreshing JWT token via proxy:", proxyError);
          }
          
          // If proxy fails, try direct URL
          console.log("Proxy token refresh failed, trying direct URL...");
          const SERVER_ENDPOINT = process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
          
          try {
            const directResponse = await fetch(`${SERVER_ENDPOINT}/api/generate-jwt`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              credentials: "include",
            });

            if (directResponse.ok) {
              const data = await directResponse.json();

              if (data.success && data.token) {
                dispatch(
                  agentAction.setJwtToken({
                    token: data.token,
                    expiry: data.expiresAt,
                  })
                );
                console.log(
                  "JWT token refreshed via direct URL, expires:",
                  new Date(data.expiresAt * 1000).toLocaleTimeString()
                );
                return;
              }
            } else {
              console.warn(`Direct token response not OK: ${directResponse.status}`);
            }
          } catch (directError) {
            console.error("Error refreshing JWT token via direct URL:", directError);
          }
          
          // Generate a fake token for local development if server is not running
          console.log("Using development fallback token");
          const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkRldiBVc2VyIiwiaWF0IjoxNTE2MjM5MDIyfQ.L8i6g3PfcHlioHCCPURC9pmXT7gdJpx3kOoyAfNUwCc";
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
        }
      } catch (error) {
        console.error("Error refreshing JWT token (all methods):", error);
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
