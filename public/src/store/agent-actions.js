// public/src/store/agent-actions.js
import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";

// Action creator for sending a question to selected agents
export const sendAgentQuestion = (questionData) => {
  return async (dispatch) => {
    try {
      // Start loading
      dispatch(uiAction.setLoading(true));
      dispatch(agentAction.setLoading(true));

      const { question, agents, chatHistoryId } = questionData;

      // Send the question request
      const response = await fetch("/api/agent-question", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          question,
          agents,
          chatHistoryId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to submit question");
      }

      // Add user question to chat
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: "",
            isLoader: "yes",
          },
        })
      );

      // Set active task
      dispatch(agentAction.setActiveTask(data.taskId));

      // Poll for the response
      return pollAgentResponse(dispatch, data.taskId, chatHistoryId);
    } catch (error) {
      console.error("Error sending agent question:", error);

      // Show error message
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: questionData.question,
            gemini: `<div class="simple-search-results error">
            <h3>Agent Error</h3>
            <p>Sorry, there was an error processing your request: ${error.message}</p>
          </div>`,
            isLoader: "no",
          },
        })
      );

      // End loading
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));
      dispatch(agentAction.clearActiveTask());

      throw error;
    }
  };
};

// Helper function to poll for agent response
const pollAgentResponse = async (dispatch, taskId, chatHistoryId) => {
  try {
    const response = await fetch(`/api/agent-response/${taskId}`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`Request failed with status: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === "complete") {
      // Success! We have the response
      dispatch(chatAction.popChat()); // Remove loading message

      // Add the response to chat
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: "",
            gemini: data.formattedHtml,
            isLoader: "no",
            isSearch: true,
            searchType: "simple", // Using simple search format, as requested
          },
        })
      );

      // Update chat history ID if provided
      if (data.chatHistoryId) {
        dispatch(
          chatAction.chatHistoryIdHandler({
            chatHistoryId: data.chatHistoryId,
          })
        );
      }

      // End loading
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));
      dispatch(agentAction.clearActiveTask());

      // If we are not on the app page, navigate there
      const pathname = window.location.pathname;
      if (pathname === "/") {
        window.history.pushState({}, "", "/app");
      }

      return data;
    }

    // Still pending, wait and try again
    // Use polling interval based on the Python script (2 seconds default)
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return pollAgentResponse(dispatch, taskId, chatHistoryId);
  } catch (error) {
    console.error("Error polling for agent response:", error);

    // Show error message
    dispatch(chatAction.popChat()); // Remove loading message
    dispatch(
      chatAction.chatStart({
        useInput: {
          user: "",
          gemini: `<div class="simple-search-results error">
          <h3>Agent Response Error</h3>
          <p>Sorry, there was an error retrieving the agent response: ${error.message}</p>
        </div>`,
          isLoader: "no",
        },
      })
    );

    // End loading
    dispatch(uiAction.setLoading(false));
    dispatch(agentAction.setLoading(false));
    dispatch(agentAction.clearActiveTask());

    throw error;
  }
};

// Action creator for fetching available agents
export const fetchAvailableAgents = () => {
  return async (dispatch) => {
    try {
      dispatch(agentAction.setLoading(true));

      const response = await fetch("/api/available-agents", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Request failed with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch agents");
      }

      dispatch(agentAction.setAgents(data.agents));
      dispatch(agentAction.setLoading(false));

      return data.agents;
    } catch (error) {
      console.error("Error fetching agents:", error);

      dispatch(agentAction.setError(error.message));
      dispatch(agentAction.setLoading(false));

      // Set fallback agents that match the Python script IDs
      const fallbackAgents = [
        {
          id: "MRlQT_lhFw",
          name: "Client Agent",
          description: "Client-related questions",
        },
        {
          id: "zr_ag",
          name: "ZR Agent",
          description: "Zoom Room questions",
        },
      ];

      dispatch(agentAction.setAgents(fallbackAgents));

      throw error;
    }
  };
};
