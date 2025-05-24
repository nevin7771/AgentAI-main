// public/src/components/InputSection/InputSection.js - COMPLETE FIX
import styles from "./InputSection.module.css";
import { sendDeepSearchRequest, getRecentChat } from "../../store/chat-action";
import { sendAgentQuestion } from "../../store/agent-actions";
import {
  sendDirectConfluenceQuestion,
  sendDirectMonitorQuestion,
} from "../../store/day-one-agent-actions";
import { sendChatData } from "../../store/chat-action"; // CRITICAL: Import for regular chat
import pollAgentTask from "../../utils/agentTaskPoller";
import { highlightKeywords } from "../../utils/highlightKeywords";
import { useEffect, useState, useRef, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { chatAction } from "../../store/chat";
import { uiAction } from "../../store/ui-gemini";

const InputSection = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [userInput, setUserInput] = useState("");
  const [searchMode, setSearchMode] = useState("simple");
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const textareaRef = useRef(null);
  const uploadMenuRef = useRef(null);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const suggestPrompt = useSelector((state) => state.chat.suggestPrompt);
  const previousChat = useSelector((state) => state.chat.previousChat); // For conversation continuation

  // CRITICAL FIX: Check for any active loading state
  const isLoaderActive = useSelector((state) => {
    const chats = state.chat.chats;
    const hasLoadingChat = chats.some(
      (chat) =>
        chat.isLoader === "yes" ||
        chat.isLoader === "streaming" ||
        chat.isLoader === "partial"
    );
    return hasLoadingChat ? "yes" : "no";
  });

  // Get selectedAgents from Redux store
  const selectedAgents = useSelector((state) => state.agent.selectedAgents);

  // Agent ID mapping for display names
  const AGENT_DISPLAY_NAMES = {
    conf_ag: "Confluence Agent",
    monitor_ag: "Monitor Agent",
    jira_ag: "Jira Agent",
    client_agent: "Client Agent",
    zr_ag: "ZR Agent",
    zp_ag: "ZP Agent",
    dayone_ag: "Day One Agent",
  };

  const getAgentDisplayName = useCallback((agentId) => {
    return AGENT_DISPLAY_NAMES[agentId] || "Agent";
  }, []);

  const userInputHandler = (e) => {
    setUserInput(e.target.value);
  };

  // Effect for auto-resizing the textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [userInput]);

  const setSimpleSearch = () => {
    setSearchMode("simple");
    setShowUploadOptions(false);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 0);
  };

  const setDeepSearch = () => {
    setSearchMode("deep");
    setShowUploadOptions(false);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
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

  // Function to check if an agent is a Day One streaming agent
  const isDayOneStreamingAgent = useCallback((agentId) => {
    return agentId === "conf_ag" || agentId === "monitor_ag";
  }, []);

  // CRITICAL FIX: Enhanced onSubmitHandler for immediate streaming and proper conversation continuation
  const onSubmitHandler = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isLoaderActive === "yes") return;

    const currentInput = userInput;
    setUserInput(""); // Clear input field immediately

    console.log(`[InputSection] Submitting: "${currentInput}"`);
    console.log(`[InputSection] Current chat history ID: ${chatHistoryId}`);
    console.log(`[InputSection] Selected agents: ${selectedAgents.join(", ")}`);
    console.log(
      `[InputSection] Has previous chat context: ${previousChat?.length > 0}`
    );

    try {
      // CRITICAL FIX: Only navigate if we don't have a chat history (new conversation)
      if (!chatHistoryId) {
        const targetUrl = "/app";
        console.log(
          `[InputSection] Navigating to new conversation: ${targetUrl}`
        );
        navigate(targetUrl);
      } else {
        console.log(
          `[InputSection] Continuing existing conversation: ${chatHistoryId}`
        );
      }

      // Always show initial loading state
      dispatch(uiAction.setLoading(true));

      if (selectedAgents.length > 0) {
        const selectedAgentId = selectedAgents[0];
        console.log(
          `[InputSection] Processing agent request: ${selectedAgentId}`
        );

        if (isDayOneStreamingAgent(selectedAgentId)) {
          console.log(
            `[InputSection] Using Day One streaming for ${selectedAgentId}`
          );

          // CRITICAL FIX: Start streaming process without awaiting completion
          if (selectedAgentId === "conf_ag") {
            // Don't await - let it stream in background
            dispatch(
              sendDirectConfluenceQuestion({
                question: currentInput,
                chatHistoryId,
                navigate,
              })
            )
              .then((response) => {
                console.log(
                  `[InputSection] Confluence streaming completed:`,
                  response
                );
                // Handle post-completion logic if needed
                if (response && response.success) {
                  setTimeout(() => {
                    dispatch(getRecentChat());
                  }, 1000);
                }
              })
              .catch((error) => {
                console.error(
                  `[InputSection] Confluence streaming error:`,
                  error
                );
              });
          } else if (selectedAgentId === "monitor_ag") {
            // Don't await - let it stream in background
            dispatch(
              sendDirectMonitorQuestion({
                question: currentInput,
                chatHistoryId,
                navigate,
              })
            )
              .then((response) => {
                console.log(
                  `[InputSection] Monitor streaming completed:`,
                  response
                );
                // Handle post-completion logic if needed
                if (response && response.success) {
                  setTimeout(() => {
                    dispatch(getRecentChat());
                  }, 1000);
                }
              })
              .catch((error) => {
                console.error(`[InputSection] Monitor streaming error:`, error);
              });
          }

          // Clean up loading state immediately since streaming will handle its own state
          dispatch(uiAction.setLoading(false));
        } else {
          // Handle other (non-streaming) agents
          console.log(
            `[InputSection] Using standard agent processing for ${selectedAgentId}`
          );

          const agentResponse = await dispatch(
            sendAgentQuestion({
              question: currentInput,
              agents: selectedAgents,
              chatHistoryId,
              navigate,
            })
          );

          console.log(`[InputSection] Agent response:`, agentResponse);

          // Handle orchestrated response
          if (agentResponse && agentResponse.orchestrationComplete === true) {
            console.log(`[InputSection] Orchestrated response completed`);

            const finalChatId =
              agentResponse.data?.chatHistoryId || chatHistoryId;
            if (finalChatId && finalChatId !== chatHistoryId) {
              console.log(
                `[InputSection] Updating URL to: /app/${finalChatId}`
              );
              setTimeout(() => {
                navigate(`/app/${finalChatId}`, { replace: true });
                dispatch(getRecentChat());
              }, 1000);
            }
            return;
          }

          // For standard polling agents
          if (!agentResponse || !agentResponse.taskId) {
            console.error(
              `[InputSection] Invalid agent response:`,
              agentResponse
            );
            throw new Error(
              "Failed to get a valid response from agent service"
            );
          }

          console.log(
            `[InputSection] Starting polling for task: ${agentResponse.taskId}`
          );

          // Use pollAgentTask utility for robust polling
          pollAgentTask(agentResponse.taskId, dispatch, {
            interval: 2000,
            maxAttempts: 60,
            onComplete: (data) => {
              console.log(`[InputSection] Agent task completed:`, data);

              // Handle final response
              handleAgentResponse({
                ...data,
                agentId: selectedAgentId,
                question: currentInput,
              });
            },
            onPending: (data) => {
              console.log(`[InputSection] Agent task pending:`, data);
            },
            onError: (error) => {
              console.error(`[InputSection] Agent task error:`, error);
              dispatch(chatAction.popChat());
              dispatch(
                chatAction.chatStart({
                  useInput: {
                    user: currentInput,
                    gemini: `<div class="${styles["error-message"]}">
                      <h3>Agent Error</h3>
                      <p>Sorry, there was an error retrieving the agent response: ${error.message}</p>
                    </div>`,
                    isLoader: "no",
                    isSearch: true,
                    searchType: "agent",
                  },
                })
              );
              dispatch(uiAction.setLoading(false));
            },
          });
        }
      } else if (searchMode === "deep" || searchMode === "simple") {
        // CRITICAL FIX: Handle search modes with proper conversation continuation
        console.log(`[InputSection] Using ${searchMode} search`);

        let searchResponse;
        if (searchMode === "deep") {
          searchResponse = await dispatch(
            sendDeepSearchRequest({
              query: currentInput,
              sources: ["support.zoom.us", "community.zoom.us", "zoom.us"],
              endpoint: "/api/deepsearch",
              chatHistoryId, // CRITICAL: Pass existing chatHistoryId for continuation
            })
          );
        } else {
          searchResponse = await dispatch(
            sendDeepSearchRequest({
              query: currentInput,
              sources: ["support.zoom.us", "community.zoom.us", "zoom.us"],
              endpoint: "/api/simplesearch",
              chatHistoryId, // CRITICAL: Pass existing chatHistoryId for continuation
            })
          );
        }

        console.log(`[InputSection] Search response:`, searchResponse);

        // CRITICAL FIX: Navigate to proper URL after search if it's a new conversation
        if (searchResponse && searchResponse.chatHistoryId && !chatHistoryId) {
          console.log(
            `[InputSection] Navigating to search result: /app/${searchResponse.chatHistoryId}`
          );
          setTimeout(() => {
            navigate(`/app/${searchResponse.chatHistoryId}`, { replace: true });
          }, 500);
        }

        // Refresh recent chats after search
        setTimeout(() => {
          dispatch(getRecentChat());
        }, 1500);
      } else {
        // CRITICAL FIX: Handle regular chat (no agents, no search) with conversation continuation
        console.log(`[InputSection] Using regular chat mode`);

        const chatResponse = await dispatch(
          sendChatData({
            user: currentInput,
            previousChat: previousChat, // Include conversation context
            chatHistoryId: chatHistoryId, // Pass existing chatHistoryId for continuation
          })
        );

        console.log(`[InputSection] Chat response:`, chatResponse);

        // CRITICAL FIX: Navigate to proper URL if it's a new conversation
        if (chatResponse && chatResponse.chatHistoryId && !chatHistoryId) {
          console.log(
            `[InputSection] Navigating to chat result: /app/${chatResponse.chatHistoryId}`
          );
          setTimeout(() => {
            navigate(`/app/${chatResponse.chatHistoryId}`, { replace: true });
          }, 500);
        }

        // Refresh recent chats
        setTimeout(() => {
          dispatch(getRecentChat());
        }, 1000);
      }

      console.log(`[InputSection] Query processing initiated successfully`);
    } catch (error) {
      console.error(`[InputSection] Error submitting query:`, error);
      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: currentInput,
            gemini: `<div class="${styles["error-message"]}">
              <h3>Error</h3>
              <p>Sorry, an unexpected error occurred: ${error.message}</p>
            </div>`,
            isLoader: "no",
            isSearch: selectedAgents.length > 0 || searchMode !== "simple",
            searchType: selectedAgents.length > 0 ? "agent" : searchMode,
          },
        })
      );
      dispatch(uiAction.setLoading(false));
    }
  };

  useEffect(() => {
    if (suggestPrompt && suggestPrompt.length > 0) {
      setUserInput(suggestPrompt);
      dispatch(chatAction.clearSuggestPrompt()); // Use proper action
    }
  }, [suggestPrompt, dispatch]);

  // Enhanced handleAgentResponse for non-Day One agents
  const handleAgentResponse = useCallback(
    (data) => {
      console.log(`[InputSection] Handling agent response:`, data);

      let resultText = "";
      if (data.result) {
        if (
          typeof data.result === "string" &&
          data.result.includes("<") &&
          data.result.includes(">")
        ) {
          resultText = data.result;
        } else if (typeof data.result === "object") {
          resultText = JSON.stringify(data.result, null, 2);
        } else {
          resultText = String(data.result);
        }
      } else {
        resultText = "Agent returned no result data.";
      }

      const isPreformattedHTML =
        resultText.includes("<") && resultText.includes(">");
      const queryKeywords = (data.question || userInput)
        .split(/\s+/)
        .filter((word) => word.length > 3);

      // CRITICAL FIX: Use existing chatHistoryId or generate proper one
      let finalChatHistoryId = data.chatHistoryId || chatHistoryId;
      if (!finalChatHistoryId || finalChatHistoryId.length < 5) {
        finalChatHistoryId = `agent_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 9)}`;
      }

      console.log(
        `[InputSection] Using chat history ID: ${finalChatHistoryId}`
      );

      // Update the chat state with the final response
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: data.question || userInput,
            gemini: resultText,
            isLoader: "no",
            isSearch: true,
            searchType: "agent",
            queryKeywords: queryKeywords,
            sources: data.sources || [],
            relatedQuestions: data.relatedQuestions || [],
            isPreformattedHTML: isPreformattedHTML,
          },
        })
      );

      // Set chat history ID in Redux
      dispatch(
        chatAction.chatHistoryIdHandler({
          chatHistoryId: finalChatHistoryId,
        })
      );

      // Update URL to show proper chat history ID only if it's different
      if (finalChatHistoryId !== chatHistoryId) {
        console.log(`[InputSection] Navigating to: /app/${finalChatHistoryId}`);
        setTimeout(() => {
          navigate(`/app/${finalChatHistoryId}`, { replace: true });
        }, 500);
      }

      // Update UI state
      dispatch(uiAction.setLoading(false));

      // Fetch recent chats to update sidebar
      setTimeout(() => {
        dispatch(getRecentChat());
      }, 800);
    },
    [dispatch, chatHistoryId, userInput, navigate]
  );

  return (
    <div className={styles["input-container"]}>
      <div className={styles["input-main"]}>
        <form onSubmit={onSubmitHandler} className={styles["input-form"]}>
          <textarea
            ref={textareaRef}
            value={userInput}
            onChange={userInputHandler}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmitHandler(e);
              }
            }}
            autoComplete="off"
            rows={1}
            placeholder={
              // CRITICAL FIX: Proper placeholder logic
              isLoaderActive === "yes"
                ? "Please wait for the response..."
                : selectedAgents.length > 0
                ? `Ask ${
                    selectedAgents.length > 1
                      ? "agents"
                      : getAgentDisplayName(selectedAgents[0])
                  }...`
                : searchMode === "simple"
                ? "Ask for a quick answer..."
                : "Ask for detailed research..."
            }
            className={styles["input-field"]}
            disabled={isLoaderActive === "yes"}
          />
          <button
            type="submit"
            className={`${styles["send-btn"]} ${
              !userInput.trim() || isLoaderActive === "yes"
                ? styles["disabled"]
                : ""
            }`}
            disabled={!userInput.trim() || isLoaderActive === "yes"}>
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
                title="Add files"
                disabled={isLoaderActive === "yes"}>
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
                  title="Get a comprehensive answer (800 words max)"
                  disabled={isLoaderActive === "yes"}>
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
                  title="Get a comprehensive research report"
                  disabled={isLoaderActive === "yes"}>
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
                    : `${getAgentDisplayName(selectedAgents[0])} Selected`}
                  {isDayOneStreamingAgent(selectedAgents[0]) && (
                    <span className={styles["streaming-badge"]}></span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles["input-help"]}>
        <span>Press Shift + Enter for new line</span>
      </div>
    </div>
  );
};

export default InputSection;
