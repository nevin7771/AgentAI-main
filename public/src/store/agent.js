// public/src/store/agent.js
import { createSlice } from "@reduxjs/toolkit";

const agentInitialState = {
  agents: [],
  selectedAgents: [],
  isLoading: false,
  error: null,
  activeTask: null,
  jwtToken: null,
  jwtExpiry: null,
  agentTasks: {}, // Stores taskId, endpoint, and token for each agent
};

const agentSlice = createSlice({
  name: "agent",
  initialState: agentInitialState,
  reducers: {
    setAgents(state, action) {
      state.agents = action.payload;
    },
    setSelectedAgents(state, action) {
      state.selectedAgents = action.payload;
    },
    addSelectedAgent(state, action) {
      if (!state.selectedAgents.includes(action.payload)) {
        state.selectedAgents.push(action.payload);
      }
    },
    removeSelectedAgent(state, action) {
      state.selectedAgents = state.selectedAgents.filter(
        (id) => id !== action.payload
      );
    },
    clearSelectedAgents(state) {
      state.selectedAgents = [];
    },
    setJwtToken(state, action) {
      state.jwtToken = action.payload.token;
      state.jwtExpiry = action.payload.expiry;
    },
    clearJwtToken(state) {
      state.jwtToken = null;
      state.jwtExpiry = null;
    },
    setActiveTask(state, action) {
      state.activeTask = action.payload;
    },
    clearActiveTask(state) {
      state.activeTask = null;
    },
    addAgentTask(state, action) {
      const { agentId, taskId, endpoint, token } = action.payload;
      state.agentTasks[agentId] = { taskId, endpoint, token };
    },
    clearAgentTasks(state) {
      state.agentTasks = {};
    },
    setLoading(state, action) {
      state.isLoading = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    },
    clearError(state) {
      state.error = null;
    },
  },
});

export const agentAction = agentSlice.actions;

export default agentSlice.reducer;