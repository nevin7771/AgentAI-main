// store/agent.js - Updated for single agent selection
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  agents: [],
  selectedAgents: [], // Keep as array for compatibility, but limit to 1 item
  jwtToken: null,
  jwtExpiry: null,
  isLoading: false,
  error: null,
};

const agentSlice = createSlice({
  name: "agent",
  initialState,
  reducers: {
    setAgents: (state, action) => {
      state.agents = action.payload;
      state.error = null;
    },

    addSelectedAgent: (state, action) => {
      const agentId = action.payload;

      // Only allow one agent at a time - clear existing and add new
      state.selectedAgents = [agentId];

      console.log(`Agent selected: ${agentId}`);
    },

    removeSelectedAgent: (state, action) => {
      const agentId = action.payload;
      state.selectedAgents = state.selectedAgents.filter(
        (id) => id !== agentId
      );

      console.log(`Agent deselected: ${agentId}`);
    },

    setSelectedAgents: (state, action) => {
      // For single agent selection, only take the first agent if multiple provided
      const agents = action.payload;
      if (Array.isArray(agents) && agents.length > 0) {
        state.selectedAgents = [agents[0]]; // Only take the first one
        console.log(`Single agent set: ${agents[0]}`);
      } else {
        state.selectedAgents = [];
      }
    },

    clearSelectedAgents: (state) => {
      const previouslySelected = state.selectedAgents;
      state.selectedAgents = [];

      if (previouslySelected.length > 0) {
        console.log(
          `Cleared selected agents: ${previouslySelected.join(", ")}`
        );
      }
    },

    setJwtToken: (state, action) => {
      const { token, expiry } = action.payload;
      state.jwtToken = token;
      state.jwtExpiry = expiry;

      // Store in localStorage for persistence
      try {
        localStorage.setItem("agent_token", token);
        localStorage.setItem("agent_token_expiry", expiry.toString());
      } catch (error) {
        console.error("Failed to store JWT token in localStorage:", error);
      }
    },

    clearJwtToken: (state) => {
      state.jwtToken = null;
      state.jwtExpiry = null;

      // Remove from localStorage
      try {
        localStorage.removeItem("agent_token");
        localStorage.removeItem("agent_token_expiry");
      } catch (error) {
        console.error("Failed to remove JWT token from localStorage:", error);
      }
    },

    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },

    setError: (state, action) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    clearError: (state) => {
      state.error = null;
    },

    // Auto-select agent based on chat history
    autoSelectAgentFromChat: (state, action) => {
      const { chatTitle, chatType, agentId } = action.payload;

      // If explicit agentId provided, use it
      if (agentId) {
        state.selectedAgents = [agentId];
        console.log(`Auto-selected agent from chat history: ${agentId}`);
        return;
      }

      // Try to detect agent from chat metadata
      if (chatType === "agent" && chatTitle) {
        const title = chatTitle.toLowerCase();
        let detectedAgent = null;

        // Agent detection logic
        if (
          title.includes("confluence") ||
          title.includes("wiki") ||
          title.includes("knowledge base")
        ) {
          detectedAgent = "conf_ag";
        } else if (
          title.includes("monitor") ||
          title.includes("log") ||
          title.includes("alert")
        ) {
          detectedAgent = "monitor_ag";
        } else if (
          title.includes("jira") ||
          title.includes("ticket") ||
          title.includes("issue")
        ) {
          detectedAgent = "jira_ag";
        } else if (title.includes("client") || title.includes("customer")) {
          detectedAgent = "client_agent";
        } else if (title.includes("zoom room") || title.includes("zr")) {
          detectedAgent = "zr_ag";
        } else if (title.includes("zoom phone") || title.includes("zp")) {
          detectedAgent = "zp_ag";
        }

        if (detectedAgent) {
          state.selectedAgents = [detectedAgent];
          console.log(
            `Auto-detected and selected agent: ${detectedAgent} from title: "${chatTitle}"`
          );
        } else {
          // Clear selection if no agent detected
          state.selectedAgents = [];
          console.log(`No agent detected from title: "${chatTitle}"`);
        }
      } else {
        // Clear selection for non-agent chats
        state.selectedAgents = [];
      }
    },

    // Initialize JWT from localStorage on app start
    initializeJwtFromStorage: (state) => {
      try {
        const token = localStorage.getItem("agent_token");
        const expiry = localStorage.getItem("agent_token_expiry");

        if (token && expiry) {
          const expiryNumber = parseInt(expiry, 10);
          const now = Math.floor(Date.now() / 1000);

          // Only restore if token hasn't expired
          if (expiryNumber > now) {
            state.jwtToken = token;
            state.jwtExpiry = expiryNumber;
            console.log("JWT token restored from localStorage");
          } else {
            // Remove expired token
            localStorage.removeItem("agent_token");
            localStorage.removeItem("agent_token_expiry");
            console.log("Expired JWT token removed from localStorage");
          }
        }
      } catch (error) {
        console.error("Failed to initialize JWT from localStorage:", error);
      }
    },
  },
});

export const agentAction = agentSlice.actions;
export default agentSlice.reducer;

// Selectors for convenience
export const selectAgents = (state) => state.agent.agents;
export const selectSelectedAgents = (state) => state.agent.selectedAgents;
export const selectCurrentAgent = (state) => {
  const selected = state.agent.selectedAgents;
  return selected.length > 0 ? selected[0] : null;
};
export const selectIsLoading = (state) => state.agent.isLoading;
export const selectError = (state) => state.agent.error;
export const selectJwtToken = (state) => state.agent.jwtToken;
export const selectJwtExpiry = (state) => state.agent.jwtExpiry;
