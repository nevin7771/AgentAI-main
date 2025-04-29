// public/src/store/agent-actions.js
import { chatAction } from "./chat";
import { uiAction } from "./ui-gemini";
import { agentAction } from "./agent";
import { getRecentChat } from "./chat-action";

// Get the server endpoint from environment variable or use default
export const SERVER_ENDPOINT =
  process.env.REACT_APP_SERVER_ENDPOINT || "http://localhost:3030";
// Always use proxy in development for direct API calls
export const USE_PROXY = process.env.REACT_APP_USE_PROXY !== "false";
// Base URL: empty string when using proxy, or explicit server endpoint
export const BASE_URL = USE_PROXY ? "" : SERVER_ENDPOINT;

// Action creator for sending a question to selected agents
export const sendAgentQuestion = (questionData) => {
  return async (dispatch) => {
    try {
      // Start loading
      dispatch(uiAction.setLoading(true));
      dispatch(agentAction.setLoading(true));

      const { question, agents, chatHistoryId } = questionData;

      console.log(
        `Sending agent question: "${question}" to agents: ${JSON.stringify(
          agents
        )}`
      );

      // First try with proxy approach
      let url = "/api/agent-question"; // Use proxy path (relative)
      let response;

      try {
        console.log(`Attempting to send agent question via proxy to: ${url}`);
        // Send the question request - using proxy
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            question,
            agents,
            chatHistoryId,
          }),
        });

        // If fetch worked but returned an error, try the direct URL
        if (!response.ok) {
          const statusCode = response.status;
          console.warn(
            `Proxy agent request failed with status ${statusCode}, trying direct URL...`
          );
          throw new Error(`Server Error: ${statusCode}`);
        }
      } catch (proxyError) {
        console.error("Proxy agent request failed:", proxyError);

        // Try direct URL as a fallback
        url = `${SERVER_ENDPOINT}/api/agent-question`;
        console.log(`Trying direct URL for agent request: ${url}`);

        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
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
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to submit question");
      }

      // Check for missing taskId and provide a fallback
      if (!data.taskId) {
        console.warn(
          "Server response missing taskId, creating fallback task ID"
        );
        // Generate a fallback taskId
        data.taskId = `fallback_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        // Create empty agentTasks if missing
        if (!data.agentTasks) {
          data.agentTasks = {};
          agents.forEach((agentId) => {
            data.agentTasks[agentId] = {
              taskId: data.taskId,
              endpoint: null,
            };
          });
        }
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
              taskId: agentTask.taskId || data.taskId, // Use parent taskId as fallback
              endpoint:
                agentTask.endpoint ||
                `https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=${agentId}`,
              token: data.token || localStorage.getItem("agent_token"),
            })
          );
        });
      } else {
        // If no agent tasks are returned, create basic task entries for each agent
        console.warn(
          "No agent tasks in response, creating fallback task entries"
        );
        agents.forEach((agentId) => {
          dispatch(
            agentAction.addAgentTask({
              agentId,
              taskId: data.taskId,
              endpoint: `https://dg01ai.zoom.us/open/api/v1/caic/general-ai/MRlQT_PPQM2nZVaQVflhFw?skillSettingId=${agentId}`,
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
            isSearch: true,
          },
        })
      );

      // End loading
      dispatch(uiAction.setLoading(false));
      dispatch(agentAction.setLoading(false));
      dispatch(agentAction.clearActiveTask());

      // Return a fallback response object with taskId
      return {
        success: false,
        error: error.message,
        taskId: `error_${Date.now()}`,
        agentTasks: questionData.agents.reduce((acc, agentId) => {
          acc[agentId] = {
            taskId: `error_${Date.now()}`,
            endpoint: null,
          };
          return acc;
        }, {}),
      };
    }
  };
};

// Helper function to poll for agent response
export const pollAgentResponse = (taskId) => {
  return async (dispatch) => {
    try {
      console.log(`Polling for agent response with taskId: ${taskId}`);

      // First try with proxy approach
      let url = `/api/agent-response/${taskId}`; // Use proxy path (relative)
      let response;

      try {
        console.log(`Attempting to poll agent response via proxy from: ${url}`);
        // Send the request using proxy
        response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        // If fetch worked but returned an error, try the direct URL
        if (!response.ok) {
          const statusCode = response.status;
          console.warn(
            `Proxy agent poll failed with status ${statusCode}, trying direct URL...`
          );
          throw new Error(`Server Error: ${statusCode}`);
        }
      } catch (proxyError) {
        console.error("Proxy agent poll failed:", proxyError);

        // Try direct URL as a fallback
        url = `${SERVER_ENDPOINT}/api/agent-response/${taskId}`;
        console.log(`Trying direct URL for agent poll: ${url}`);

        response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status: ${response.status}`);
        }
      }

      if (!response.ok) {
        throw new Error(`Request failed with status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Agent poll response:", data);

      if (data.status === "complete") {
        // Success! We have the response
        dispatch(chatAction.popChat()); // Remove loading message

        // Log the response to aid in debugging
        console.log("Agent response received:", data);

        // Format the HTML for display
        let formattedHtml = data.formattedHtml;

        // Use simple formatting if no formatted HTML is available
        if (!formattedHtml && data.result) {
          console.log("Creating formatted HTML from result:", data.result);
          const resultText =
            typeof data.result === "object"
              ? JSON.stringify(data.result, null, 2)
              : String(data.result);

          formattedHtml = `
            <div class="simple-search-results">
              <h3>Agent Response</h3>
              <div class="simple-search-content">
                <p>${resultText.replace(/\n/g, "<br>")}</p>
              </div>
            </div>
          `;
        }

        // Add the response to chat
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: data.question || "Agent query",
              gemini: formattedHtml,
              isLoader: "no",
              isSearch: true,
              searchType: "agent", // Use agent type to apply correct styling
            },
          })
        );

        // Generate a chat history ID if not provided
        const newChatHistoryId =
          data.chatHistoryId ||
          `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        // Update chat history ID
        dispatch(
          chatAction.chatHistoryIdHandler({
            chatHistoryId: newChatHistoryId,
          })
        );

        // Store in localStorage for sidebar history (similar to search results)
        try {
          console.log("Saving agent search to local storage history");
          // Get existing history from localStorage or initialize empty array
          const existingHistory = JSON.parse(
            localStorage.getItem("searchHistory") || "[]"
          );

          // Add new item to history
          const historyItem = {
            id: newChatHistoryId,
            title: data.question || "Agent Query",
            timestamp: new Date().toISOString(),
            type: "agent",
          };

          // Add to beginning of array (most recent first)
          existingHistory.unshift(historyItem);

          // Limit history to 50 items
          const limitedHistory = existingHistory.slice(0, 50);

          // Save back to localStorage
          localStorage.setItem("searchHistory", JSON.stringify(limitedHistory));
          console.log("Agent search saved to localStorage history");
        } catch (err) {
          console.error("Error saving agent search to localStorage:", err);
        }

        // Create chat history record if not already done
        if (!data.chatHistoryId) {
          console.log("Creating new chat history record on server");

          try {
            // First try with proxy approach
            let url = `/api/create-chat-history`;
            let historyResponse;

            try {
              console.log(
                `Attempting to create chat history via proxy: ${url}`
              );
              // Create the chat history on the server via proxy
              historyResponse = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  title: data.question || "Agent response",
                  message: {
                    user: data.question || "Agent query",
                    gemini: formattedHtml,
                  },
                  isSearch: true,
                  searchType: "agent",
                }),
              });

              // If fetch worked but returned an error, try the direct URL
              if (!historyResponse.ok) {
                const statusCode = historyResponse.status;
                console.warn(
                  `Proxy create history failed with status ${statusCode}, trying direct URL...`
                );
                throw new Error(`Server Error: ${statusCode}`);
              }
            } catch (proxyError) {
              console.error("Proxy create history failed:", proxyError);

              // Try direct URL as a fallback
              url = `${SERVER_ENDPOINT}/api/create-chat-history`;
              console.log(`Trying direct URL for create history: ${url}`);

              historyResponse = await fetch(url, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  title: data.question || "Agent response",
                  message: {
                    user: data.question || "Agent query",
                    gemini: formattedHtml,
                  },
                  isSearch: true,
                  searchType: "agent",
                }),
              });
            }

            if (historyResponse.ok) {
              const historyData = await historyResponse.json();
              if (historyData.success && historyData.chatHistoryId) {
                console.log(
                  "Chat history created on server with ID:",
                  historyData.chatHistoryId
                );

                // Update chat history ID with the one from the server
                dispatch(
                  chatAction.chatHistoryIdHandler({
                    chatHistoryId: historyData.chatHistoryId,
                  })
                );

                // Update the localStorage entry to use the server ID
                try {
                  const existingHistory = JSON.parse(
                    localStorage.getItem("searchHistory") || "[]"
                  );

                  // Find and update the temporary ID
                  const updatedHistory = existingHistory.map((item) => {
                    if (item.id === newChatHistoryId) {
                      return { ...item, id: historyData.chatHistoryId };
                    }
                    return item;
                  });

                  localStorage.setItem(
                    "searchHistory",
                    JSON.stringify(updatedHistory)
                  );
                  console.log(
                    "Updated localStorage with server chat history ID"
                  );
                } catch (err) {
                  console.error("Error updating localStorage history ID:", err);
                }
              }
            }
          } catch (error) {
            console.error("Error creating chat history:", error);
          }
        }

        // End loading
        dispatch(uiAction.setLoading(false));
        dispatch(agentAction.setLoading(false));
        dispatch(agentAction.clearActiveTask());

        // Return the data for further processing if needed
        return { ...data, status: "complete" };
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
            isSearch: true,
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

      // First try with proxy approach
      let url = `/api/available-agents`; // Use proxy path (relative)
      let response;

      try {
        console.log(
          `Attempting to fetch available agents via proxy from: ${url}`
        );
        // Send the request using proxy
        response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        // If fetch worked but returned an error, try the direct URL
        if (!response.ok) {
          const statusCode = response.status;
          console.warn(
            `Proxy agents fetch failed with status ${statusCode}, trying direct URL...`
          );
          throw new Error(`Server Error: ${statusCode}`);
        }
      } catch (proxyError) {
        console.error("Proxy agents fetch failed:", proxyError);

        // Try direct URL as a fallback
        url = `${SERVER_ENDPOINT}/api/available-agents`;
        console.log(`Trying direct URL for agents fetch: ${url}`);

        response = await fetch(url, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Request failed with status: ${response.status}`);
        }
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
      ];

      dispatch(agentAction.setAgents(fallbackAgents));

      throw error;
    }
  };
};

// Action to delete agent chat history
export const deleteAgentChatHistory = (chatHistoryId) => {
  return async (dispatch) => {
    try {
      // First try with proxy approach
      let url = `/api/chat-history/${chatHistoryId}`; // Use proxy path (relative)
      let response;

      try {
        console.log(`Attempting to delete chat history via proxy: ${url}`);
        // Send the request using proxy
        response = await fetch(url, {
          method: "DELETE",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        // If fetch worked but returned an error, try the direct URL
        if (!response.ok) {
          const statusCode = response.status;
          console.warn(
            `Proxy delete request failed with status ${statusCode}, trying direct URL...`
          );
          throw new Error(`Server Error: ${statusCode}`);
        }
      } catch (proxyError) {
        console.error("Proxy delete request failed:", proxyError);

        // Try direct URL as a fallback
        url = `${SERVER_ENDPOINT}/api/chat-history/${chatHistoryId}`;
        console.log(`Trying direct URL for delete request: ${url}`);

        response = await fetch(url, {
          method: "DELETE",
          credentials: "include",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(
            `Delete request failed with status: ${response.status}`
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          `Delete request failed with status: ${response.status}`
        );
      }

      // Parse the response
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to delete chat history");
      }

      // Update recent chats after successful deletion
      dispatch(getRecentChat());

      return { success: true };
    } catch (error) {
      console.error("Error deleting chat history:", error);
      throw error;
    }
  };
};
