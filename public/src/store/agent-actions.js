// public/src/store/agent-actions.js
import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";

// Get the server endpoint from environment variable or use default
export const SERVER_ENDPOINT =
  process.env.REACT_APP_SERVER_ENDPOINT || "https://vista.nklab.ltd";

// Action creator for sending a question to selected agents
export const sendAgentQuestion = (questionData) => {
  return async (dispatch) => {
    try {
      // Start loading
      dispatch(uiAction.setLoading(true));
      dispatch(agentAction.setLoading(true));

      const { question, agents, chatHistoryId } = questionData;

      // Send the question request - using full URL with SERVER_ENDPOINT
      const response = await fetch(`${SERVER_ENDPOINT}/api/agent-question`, {
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

      // Add user question to chat with loading indicator
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: question,
            gemini: "",
            isLoader: "yes",
            isSearch: true, // Mark as search result to show loading animation
            searchType: "agent", // Mark as agent search
          },
        })
      );

      console.log("Starting agent task:", data.taskId); // Add logging
      // Set active task
      dispatch(agentAction.setActiveTask(data.taskId));

      // Store task information for each agent
      if (data.agentTasks) {
        Object.entries(data.agentTasks).forEach(([agentId, agentTask]) => {
          dispatch(
            agentAction.addAgentTask({
              agentId,
              taskId: agentTask.taskId,
              endpoint:
                agentTask.endpoint ||
                `https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=${agentId}`,
              token: data.token || localStorage.getItem("agent_token"),
            })
          );
        });
      }

      // Return task data for polling
      return data;
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
export const pollAgentResponse = (taskId) => {
  return async (dispatch) => {
    try {
      console.log(`Polling for agent response with taskId: ${taskId}`);

      // Using full URL with SERVER_ENDPOINT
      const response = await fetch(
        `${SERVER_ENDPOINT}/api/agent-response/${taskId}`,
        {
          method: "GET",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed with status: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === "complete") {
        // Success! We have the response
        dispatch(chatAction.popChat()); // Remove loading message

        // Add the response to chat
        // Log the response to aid in debugging
        console.log("Agent response received:", data);

        dispatch(
          chatAction.chatStart({
            useInput: {
              user: "",
              gemini: data.formattedHtml,
              isLoader: "no",
              isSearch: true,
              searchType: "simple", // Using simple search format
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

          // Ensure navigation to the chat page with history ID
          window.location.href = `/app/${data.chatHistoryId}`;
        }

        // End loading
        dispatch(uiAction.setLoading(false));
        dispatch(agentAction.setLoading(false));
        dispatch(agentAction.clearActiveTask());

        // Return the data for further processing if needed
        return data;
      }

      // Still pending - return status info
      return data;
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
};

// Action creator for fetching available agents
export const fetchAvailableAgents = () => {
  return async (dispatch) => {
    try {
      dispatch(agentAction.setLoading(true));

      // Using full URL with SERVER_ENDPOINT
      const response = await fetch(`${SERVER_ENDPOINT}/api/available-agents`, {
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
