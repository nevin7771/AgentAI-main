// public/src/components/InputSection/InputSection.js
import styles from "./InputSection.module.css";
import { sendDeepSearchRequest, getRecentChat } from "../../store/chat-action";
import { sendAgentQuestion } from "../../store/agent-actions";
import pollAgentTask from "../../utils/agentTaskPoller";
import { highlightKeywords } from "../../utils/highlightKeywords";
import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { chatAction } from "../../store/chat";
import { uiAction } from "../../store/ui-gemini";
import AgentPollingManager from "../AgentPolling";

const InputSection = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [userInput, setUserInput] = useState("");
  const [searchMode, setSearchMode] = useState("simple"); // "simple" or "deep"
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const inputRef = useRef(null);
  const uploadMenuRef = useRef(null);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const suggestPrompt = useSelector((state) => state.chat.suggestPrompt);

  // Get selectedAgents from Redux store
  const selectedAgents = useSelector((state) => state.agent.selectedAgents);

  // State for direct agent polling
  const [directPollingConfig, setDirectPollingConfig] = useState(null);

  const userInputHandler = (e) => {
    setUserInput(e.target.value);
  };

  const setSimpleSearch = () => {
    setSearchMode("simple");
    setShowUploadOptions(false);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  const setDeepSearch = () => {
    setSearchMode("deep");
    setShowUploadOptions(false);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  const toggleUploadOptions = () => {
    setShowUploadOptions(!showUploadOptions);
  };

  const handleUploadOption = (type) => {
    console.log(`Handling ${type} upload`);
    setShowUploadOptions(false);
  };

  // Close upload options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        uploadMenuRef.current &&
        !uploadMenuRef.current.contains(event.target)
      ) {
        setShowUploadOptions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Function to handle agent response directly
  const handleAgentResponse = (data) => {
    // Format the result text from the agent
    let resultText = "";
    if (data.result) {
      resultText =
        typeof data.result === "object"
          ? JSON.stringify(data.result, null, 2)
          : String(data.result);
    } else {
      resultText = "Agent returned no result data";
    }

    // Check for error codes or messages in the result
    const isErrorResult =
      resultText.includes("error code") ||
      resultText.includes("not explicitly");

    // Format the text
    try {
      // Replace Markdown headers with HTML headers
      resultText = resultText.replace(/##\s+([^\n]+)/g, "<h2>$1</h2>");

      // Replace Markdown list items with HTML list items
      resultText = resultText.replace(/^\s*-\s+([^\n]+)/gm, "<li>$1</li>");

      // Wrap list items in unordered lists
      if (resultText.includes("<li>")) {
        resultText = resultText.replace(
          /(<li>.*?<\/li>)\s*\n\s*(?!<li>)/gs,
          "$1</ul>\n"
        );
        resultText = resultText.replace(
          /(?<!<\/ul>)\s*\n\s*(<li>)/gs,
          "\n<ul>$1"
        );

        // Close any remaining unclosed lists
        if (
          (resultText.match(/<ul>/g) || []).length >
          (resultText.match(/<\/ul>/g) || []).length
        ) {
          resultText += "</ul>";
        }
      }

      // Convert line breaks
      resultText = resultText.replace(/\n\n/g, "<br><br>");
      resultText = resultText.replace(/\n/g, "<br>");
    } catch (e) {
      console.error("Error formatting Markdown:", e);
      // Fall back to simple string with line breaks
      resultText = resultText.replace(/\n/g, "<br>");
    }

    // Highlight keywords from the query
    const highlightedText = highlightKeywords(
      resultText,
      data.question || userInput
    );

    // Build the HTML for display - CLEAN VERSION to match support documentation style
    const formattedResult = `
      <div class="support-doc-results">
        <div class="support-content-wrapper">
          <div class="support-main-content">
            <div class="support-answer">
              ${highlightedText}
            </div>
          </div>
        </div>
      </div>
    `;

    // Remove any loading message
    dispatch(chatAction.popChat());

    // Add the result to chat
    dispatch(
      chatAction.chatStart({
        useInput: {
          user: data.question || "Agent query",
          gemini: formattedResult,
          isLoader: "no",
          isSearch: true,
          searchType: "agent", // Use agent format for clarity
        },
      })
    );

    // Use server-provided chat history ID if available or generate one
    const chatId =
      data.chatHistoryId ||
      `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    console.log(
      `Using chat history ID: ${chatId} (from server: ${!!data.chatHistoryId})`
    );

    // Set chat history ID
    dispatch(
      chatAction.chatHistoryIdHandler({
        chatHistoryId: chatId,
      })
    );

    // Store in localStorage for persistence across page refreshes
    const storableChatData = {
      id: chatId,
      title: data.question || userInput || "Agent query",
      searchType: "agent",
      isSearch: true,
      timestamp: new Date().toISOString(),
      gemini: formattedResult,
      user: data.question || userInput || "Agent query",
    };

    try {
      // Save to local storage as backup
      const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
      // Check if this chat already exists
      const existingIndex = savedChats.findIndex((chat) => chat.id === chatId);

      if (existingIndex > -1) {
        // Update existing
        savedChats[existingIndex] = storableChatData;
      } else {
        // Add new
        savedChats.unshift(storableChatData);
      }

      // Store back to localStorage (limit to 50 entries)
      localStorage.setItem(
        "savedChats",
        JSON.stringify(savedChats.slice(0, 50))
      );
      console.log("Saved agent chat to localStorage for persistence");
    } catch (err) {
      console.error("Failed to save chat to localStorage:", err);
    }

    // Update UI state
    dispatch(uiAction.setLoading(false));

    // Fetch recent chats to update sidebar
    setTimeout(() => {
      dispatch(getRecentChat());
    }, 500);

    // Navigate to the chat page
    navigate(`/app/${chatId}`);
  };

  const onSubmitHandler = async (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    // If agents are selected, route to agent API instead of simple/deep search
    if (selectedAgents.length > 0) {
      try {
        dispatch(uiAction.setLoading(true));

        // Add loading indicator to chat - ONLY ADD THIS ONCE
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: userInput,
              gemini: "",
              isLoader: "yes",
              isSearch: true,
              searchType: "agent",
            },
          })
        );

        // Send the question and get the task ID
        console.log(
          "Sending agent question with input:",
          userInput,
          "agents:",
          selectedAgents
        );

        // Send the question and get the task ID
        const agentResponse = await dispatch(
          sendAgentQuestion({
            question: userInput,
            agents: selectedAgents,
            chatHistoryId,
          })
        );

        // Check if the response is valid and contains a taskId
        if (!agentResponse || !agentResponse.taskId) {
          console.error("Invalid agent response:", agentResponse);
          throw new Error("Failed to get a valid response from agent service");
        }

        console.log("Agent response task ID:", agentResponse.taskId);

        // Start polling for agent response
        const selectedAgentId = selectedAgents[0];

        if (
          selectedAgents.length === 1 &&
          agentResponse.agentTasks &&
          agentResponse.agentTasks[selectedAgentId]
        ) {
          // For single agent, try direct polling
          const agentTask = agentResponse.agentTasks[selectedAgentId];
          console.log(
            `Setting up direct polling for agent ${selectedAgentId}:`,
            agentTask
          );

          // Start immediate manual polling
          let attempts = 0;
          const maxAttempts = 30;
          const pollInterval = 2000;

          const poll = async () => {
            attempts++;
            console.log(`Manual poll attempt ${attempts}/${maxAttempts}`);

            try {
              const response = await fetch("/api/proxy-agent-poll", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                  agentId: selectedAgentId,
                  taskId: agentTask.taskId,
                }),
              });

              if (!response.ok) {
                // Try to parse error response for more details
                let errorDetails = "";
                try {
                  const errorData = await response.json();
                  errorDetails =
                    errorData.error ||
                    errorData.message ||
                    JSON.stringify(errorData);
                  console.error(
                    "Error response from proxy-agent-poll:",
                    errorData
                  );
                } catch (e) {
                  // If we can't parse JSON, use the status text
                  errorDetails = response.statusText;
                }

                throw new Error(
                  `Polling error: HTTP ${response.status} - ${errorDetails}`
                );
              }

              const data = await response.json();
              console.log(`Manual poll response:`, data);

              if (data.status === "complete" || data.status === "success") {
                // Process the result
                handleAgentResponse({
                  ...data,
                  agentId: selectedAgentId,
                  taskId: agentTask.taskId,
                  question: userInput,
                });
                return;
              } else if (attempts >= maxAttempts) {
                // Timeout
                console.log("Polling timed out");
                handleAgentResponse({
                  agentId: selectedAgentId,
                  taskId: agentTask.taskId,
                  question: userInput,
                  result: "The agent took too long to respond",
                });
                return;
              } else {
                // Continue polling
                setTimeout(poll, pollInterval);
              }
            } catch (error) {
              console.error("Polling error:", error);

              if (attempts >= maxAttempts) {
                handleAgentResponse({
                  agentId: selectedAgentId,
                  taskId: agentTask.taskId,
                  question: userInput,
                  result: `Error polling agent: ${error.message}`,
                });
              } else {
                setTimeout(poll, pollInterval);
              }
            }
          };

          // Start polling
          poll();
        } else {
          // For multiple agents, use regular polling through our server
          pollAgentTask(agentResponse.taskId, dispatch, {
            interval: 2000,
            maxAttempts: 30,
            onComplete: (data) => {
              console.log("Agent task complete:", data);
              navigate("/app");
            },
            onPending: (data) => {
              console.log("Agent task still pending:", data);
            },
            onError: (error) => {
              console.error("Agent task polling error:", error);

              // Show error in chat
              dispatch(chatAction.popChat());
              dispatch(
                chatAction.chatStart({
                  useInput: {
                    user: userInput,
                    gemini: `<div class="simple-search-results error">
                      <h3>Agent Error</h3>
                      <p>Sorry, there was an error retrieving the agent response: ${error.message}</p>
                    </div>`,
                    isLoader: "no",
                    isSearch: true,
                  },
                })
              );

              dispatch(uiAction.setLoading(false));
              navigate("/app");
            },
          });
        }
      } catch (error) {
        console.error("Error submitting agent question:", error);

        // Show error in chat
        dispatch(chatAction.popChat());
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: userInput,
              gemini: `<div class="simple-search-results error">
                <h3>Agent Error</h3>
                <p>Sorry, there was an error sending your question to the agent: ${error.message}</p>
              </div>`,
              isLoader: "no",
              isSearch: true,
            },
          })
        );

        dispatch(uiAction.setLoading(false));
      }
    } else {
      // No agents selected, use the normal search paths
      if (searchMode === "deep") {
        // Deep search
        dispatch(
          sendDeepSearchRequest({
            query: userInput,
            sources: ["support.zoom.us", "community.zoom.us", "zoom.us"],
            endpoint: "/api/deepsearch",
            chatHistoryId,
          })
        );
      } else {
        // Simple search (default)
        dispatch(
          sendDeepSearchRequest({
            query: userInput,
            sources: ["support.zoom.us", "community.zoom.us", "zoom.us"],
            endpoint: "/api/simplesearch",
            chatHistoryId,
          })
        );
      }
    }

    console.log(
      `Query sent: ${userInput}, Mode: ${
        selectedAgents.length > 0 ? "Agent" : searchMode
      }, Agents: ${selectedAgents.join(", ")}`
    );

    setUserInput("");
    navigate("/app");
  };

  useEffect(() => {
    if (suggestPrompt.length > 0) {
      setUserInput(suggestPrompt);
    }
  }, [suggestPrompt]);

  // Reset polling config when direct polling completes
  const handlePollingComplete = () => {
    console.log("Direct polling complete, resetting config");
    setDirectPollingConfig(null);
  };

  return (
    <div className={styles["input-container"]}>
      {/* Render the AgentPollingManager if we have direct polling config */}
      {directPollingConfig && (
        <AgentPollingManager
          agentId={directPollingConfig.agentId}
          taskId={directPollingConfig.taskId}
          endpoint={directPollingConfig.endpoint}
          token={directPollingConfig.token}
          onComplete={handlePollingComplete}
        />
      )}

      <div className={styles["input-main"]}>
        <form onSubmit={onSubmitHandler} className={styles["input-form"]}>
          <input
            ref={inputRef}
            value={userInput}
            onChange={userInputHandler}
            autoComplete="off"
            type="text"
            placeholder={
              selectedAgents.length > 0
                ? `Ask ${selectedAgents.length > 1 ? "agents" : "the agent"}...`
                : searchMode === "simple"
                ? "Ask for a quick answer..."
                : "Ask for detailed research..."
            }
            className={styles["input-field"]}
          />
          <button
            type="submit"
            className={`${styles["send-btn"]} ${
              !userInput.trim() ? styles["disabled"] : ""
            }`}
            disabled={!userInput.trim()}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
                fill="currentColor"
              />
            </svg>
          </button>
        </form>

        <div className={styles["controls-container"]}>
          <div className={styles["left-controls"]}>
            <div className={styles["upload-container"]} ref={uploadMenuRef}>
              <button
                type="button"
                className={styles["upload-button"]}
                onClick={toggleUploadOptions}
                title="Add files">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 4V20M4 12H20"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {showUploadOptions && (
                <div className={styles["upload-options"]}>
                  <button onClick={() => handleUploadOption("image")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M4 16l4-4 4 4m4-4l4 4M4 20h16M4 12V4h16v16"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Image
                  </button>
                  <button onClick={() => handleUploadOption("files")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9m-7-7l7 7m-7-7v7h7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Files
                  </button>
                  <button onClick={() => handleUploadOption("drive")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 2L2 19h20L12 2zM2 19l10-8 10 8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Drive
                  </button>
                </div>
              )}
            </div>

            {/* Only show search buttons if no agents are selected */}
            {selectedAgents.length === 0 && (
              <>
                <button
                  type="button"
                  className={`${styles["search-btn"]} ${
                    searchMode === "simple" ? styles["active"] : ""
                  }`}
                  onClick={setSimpleSearch}
                  title="Get a comprehensive answer (800 words max)">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Simple Search
                </button>

                <button
                  type="button"
                  className={`${styles["search-btn"]} ${
                    searchMode === "deep" ? styles["active"] : ""
                  }`}
                  onClick={setDeepSearch}
                  title="Get a comprehensive research report">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Deep Search
                </button>
              </>
            )}

            {/* Show agent indicator if agents are selected */}
            {selectedAgents.length > 0 && (
              <div className={styles["agent-indicator"]}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"
                    fill="currentColor"
                  />
                </svg>
                <span>
                  {selectedAgents.length > 1
                    ? `${selectedAgents.length} Agents Selected`
                    : "1 Agent Selected"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputSection;
