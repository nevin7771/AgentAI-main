// public/src/store/agent-actions.js
import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";

// Get the server endpoint from environment variable or use default
export const SERVER_ENDPOINT =
  process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
// Always use proxy in development by default for frontend dev server
export const USE_PROXY = true;
// Base URL: empty string when using proxy, or explicit server endpoint
export const BASE_URL = USE_PROXY ? '' : SERVER_ENDPOINT;

// Log API configuration
console.log('Agent API configuration:');
console.log('SERVER_ENDPOINT:', SERVER_ENDPOINT);
console.log('USE_PROXY:', USE_PROXY);
console.log('BASE_URL:', BASE_URL);

// Action creator for sending a question to selected agents
export const sendAgentQuestion = (questionData) => {
  return async (dispatch) => {
    try {
      // Start loading
      dispatch(uiAction.setLoading(true));
      dispatch(agentAction.setLoading(true));

      const { question, agents, chatHistoryId } = questionData;

      console.log('Sending agent question:', { question, agents, chatHistoryId });
      
      // First try with proxy
      try {
        console.log('Trying with proxy first...');
        const proxyResponse = await fetch(`/api/agent-question`, {
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
        
        console.log('Proxy response status:', proxyResponse.status);
        
        if (proxyResponse.ok) {
          return await handleSuccessResponse(proxyResponse, dispatch, questionData);
        } else {
          console.warn('Proxy request failed, trying direct URL...');
        }
      } catch (proxyError) {
        console.error('Error with proxy request:', proxyError);
        console.warn('Falling back to direct URL...');
      }
      
      // Fall back to direct URL if proxy fails
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
      
      console.log('Direct response status:', response.status);
      
      return await handleSuccessResponse(response, dispatch, questionData);
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

// Helper function to handle successful API response
async function handleSuccessResponse(response, dispatch, questionData) {
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
        user: questionData.question,
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
}

// Helper function to poll for agent response
export const pollAgentResponse = (taskId) => {
  return async (dispatch) => {
    try {
      console.log(`Polling for agent response with taskId: ${taskId}`);

      // First try with proxy
      let response;
      try {
        console.log('Polling via proxy first...');
        const proxyResponse = await fetch(`/api/agent-response/${taskId}`, {
          method: "GET",
          credentials: "include",
        });
        
        if (proxyResponse.ok) {
          response = proxyResponse;
        } else {
          console.warn('Proxy polling failed, trying direct URL...');
        }
      } catch (proxyError) {
        console.error('Error with proxy polling:', proxyError);
        console.warn('Falling back to direct URL for polling...');
      }
      
      // Fall back to direct URL if proxy fails
      if (!response) {
        response = await fetch(`${SERVER_ENDPOINT}/api/agent-response/${taskId}`, {
          method: "GET",
          credentials: "include",
        });
      }

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
              searchType: "agent", // Use agent search type to properly display
              agents: data.agents || [],
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

          // Store results in local state for sidebar
          try {
            // Get existing history from localStorage or initialize empty array
            const existingHistory = JSON.parse(localStorage.getItem('agentHistory') || '[]');
            
            // Add new item to history
            const historyItem = {
              id: data.chatHistoryId,
              title: data.title || 'Agent Search',
              timestamp: new Date().toISOString(),
              type: 'agent'
            };
            
            // Add to beginning of array (most recent first)
            existingHistory.unshift(historyItem);
            
            // Limit history to 50 items
            const limitedHistory = existingHistory.slice(0, 50);
            
            // Save back to localStorage
            localStorage.setItem('agentHistory', JSON.stringify(limitedHistory));
          } catch (err) {
            console.error('Error saving agent history to localStorage:', err);
          }

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
            gemini: `<div class="agent-search-results error">
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

      // First try with proxy
      let response;
      try {
        console.log('Fetching agents via proxy first...');
        const proxyResponse = await fetch(`/api/available-agents`, {
          method: "GET",
          credentials: "include",
        });
        
        if (proxyResponse.ok) {
          response = proxyResponse;
        } else {
          console.warn('Proxy agent fetch failed, trying direct URL...');
        }
      } catch (proxyError) {
        console.error('Error with proxy agent fetch:', proxyError);
        console.warn('Falling back to direct URL for agent fetch...');
      }
      
      // Fall back to direct URL if proxy fails
      if (!response) {
        response = await fetch(`${SERVER_ENDPOINT}/api/available-agents`, {
          method: "GET",
          credentials: "include",
        });
      }

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
          id: "client_agent",
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

// Action creator for deleting a chat history
export const deleteAgentChatHistory = (chatHistoryId) => {
  return async (dispatch) => {
    try {
      dispatch(uiAction.setLoading(true));

      // First try with proxy
      let response;
      try {
        console.log('Deleting chat via proxy first...');
        const proxyResponse = await fetch(`/api/chat-history/${chatHistoryId}`, {
          method: "DELETE",
          credentials: "include",
        });
        
        if (proxyResponse.ok) {
          response = proxyResponse;
        } else {
          console.warn('Proxy delete failed, trying direct URL...');
        }
      } catch (proxyError) {
        console.error('Error with proxy delete:', proxyError);
        console.warn('Falling back to direct URL for delete...');
      }
      
      // Fall back to direct URL if proxy fails
      if (!response) {
        response = await fetch(`${SERVER_ENDPOINT}/api/chat-history/${chatHistoryId}`, {
          method: "DELETE",
          credentials: "include",
        });
      }

      if (!response.ok) {
        throw new Error(`Request failed with status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to delete chat history");
      }

      // Remove from local storage
      try {
        const existingHistory = JSON.parse(localStorage.getItem('agentHistory') || '[]');
        const updatedHistory = existingHistory.filter(item => item.id !== chatHistoryId);
        localStorage.setItem('agentHistory', JSON.stringify(updatedHistory));
      } catch (err) {
        console.error('Error updating agent history in localStorage:', err);
      }

      dispatch(uiAction.setLoading(false));

      return { success: true };
    } catch (error) {
      console.error("Error deleting chat history:", error);
      dispatch(uiAction.setLoading(false));
      throw error;
    }
  };
};