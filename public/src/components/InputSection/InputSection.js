// Fixed InputSection.js - NO UNWANTED BOXES + AUTO-REFRESH RECENTS
import styles from "./InputSection.module.css";
import { sendDeepSearchRequest, getRecentChat } from "../../store/chat-action";
import { sendAgentQuestion } from "../../store/agent-actions";
import {
  sendDirectConfluenceQuestion,
  sendDirectMonitorQuestion,
} from "../../store/day-one-agent-actions";
import { sendChatData } from "../../store/chat-action";
import pollAgentTask from "../../utils/agentTaskPoller";
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
  const [showComingSoonTooltip, setShowComingSoonTooltip] = useState(false);
  const textareaRef = useRef(null);
  const uploadMenuRef = useRef(null);
  const comingSoonTimeoutRef = useRef(null);

  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const suggestPrompt = useSelector((state) => state.chat.suggestPrompt);
  const previousChat = useSelector((state) => state.chat.previousChat);
  const currentChats = useSelector((state) => state.chat.chats);

  // Enhanced loading state detection for all agent types
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

  const selectedAgents = useSelector((state) => state.agent.selectedAgents);

  // Enhanced agent ID mapping for display names
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

  // Enhanced upload options handler with coming soon notification
  const toggleUploadOptions = () => {
    if (showUploadOptions) {
      setShowUploadOptions(false);
      return;
    }

    // Show coming soon tooltip
    setShowComingSoonTooltip(true);

    if (comingSoonTimeoutRef.current) {
      clearTimeout(comingSoonTimeoutRef.current);
    }

    comingSoonTimeoutRef.current = setTimeout(() => {
      setShowComingSoonTooltip(false);
    }, 3000);
  };

  const handleUploadOption = (type) => {
    console.log(`Handling ${type} upload - Coming Soon`);
    setShowUploadOptions(false);

    setShowComingSoonTooltip(true);
    setTimeout(() => {
      setShowComingSoonTooltip(false);
    }, 2500);
  };

  // Close upload options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        uploadMenuRef.current &&
        !uploadMenuRef.current.contains(event.target)
      ) {
        setShowUploadOptions(false);
        setShowComingSoonTooltip(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (comingSoonTimeoutRef.current) {
        clearTimeout(comingSoonTimeoutRef.current);
      }
    };
  }, []);

  const isDayOneStreamingAgent = useCallback((agentId) => {
    return agentId === "conf_ag" || agentId === "monitor_ag";
  }, []);

  const isJiraAgent = useCallback((agentId) => {
    return agentId === "jira_ag";
  }, []);

  // FIXED: Enhanced onSubmitHandler with auto-refresh recents
  const onSubmitHandler = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isLoaderActive === "yes") return;

    const currentInput = userInput;
    setUserInput("");

    console.log(`[InputSection] Submitting: "${currentInput}"`);

    try {
      const hasExistingConversation = chatHistoryId && currentChats?.length > 0;

      if (!hasExistingConversation) {
        navigate("/app");
      }

      dispatch(uiAction.setLoading(true));

      if (selectedAgents.length > 0) {
        const selectedAgentId = selectedAgents[0];

        if (isJiraAgent(selectedAgentId)) {
          const jiraResponse = await dispatch(
            sendAgentQuestion({
              question: currentInput,
              agents: selectedAgents,
              chatHistoryId: chatHistoryId,
              navigate,
            })
          );

          if (jiraResponse && jiraResponse.orchestrationComplete === true) {
            const finalChatId =
              jiraResponse.data?.chatHistoryId || chatHistoryId;

            // FIXED: Auto-refresh recent chats
            setTimeout(() => {
              dispatch(getRecentChat());
            }, 1500);

            if (finalChatId && !hasExistingConversation) {
              setTimeout(() => {
                navigate(`/app/${finalChatId}`, { replace: true });
              }, 1000);
            }
            dispatch(uiAction.setLoading(false));
            return;
          }
        } else if (isDayOneStreamingAgent(selectedAgentId)) {
          console.log(`[InputSection] Using streaming for ${selectedAgentId}`);

          let streamingPromise;
          if (selectedAgentId === "conf_ag") {
            streamingPromise = dispatch(
              sendDirectConfluenceQuestion({
                question: currentInput,
                chatHistoryId: chatHistoryId,
                navigate,
              })
            );
          } else if (selectedAgentId === "monitor_ag") {
            streamingPromise = dispatch(
              sendDirectMonitorQuestion({
                question: currentInput,
                chatHistoryId: chatHistoryId,
                navigate,
              })
            );
          }

          streamingPromise
            .then((response) => {
              console.log(`[InputSection] Streaming completed:`, response);

              // FIXED: Auto-refresh recent chats after streaming completes
              setTimeout(() => {
                dispatch(getRecentChat());
              }, 2000);
            })
            .catch((error) => {
              console.error(`[InputSection] Streaming error:`, error);
            });

          dispatch(uiAction.setLoading(false));
        } else {
          // Handle other agents (standard flow)
          const agentResponse = await dispatch(
            sendAgentQuestion({
              question: currentInput,
              agents: selectedAgents,
              chatHistoryId: chatHistoryId,
              navigate,
            })
          );

          if (agentResponse && agentResponse.orchestrationComplete === true) {
            const finalChatId =
              agentResponse.data?.chatHistoryId || chatHistoryId;

            // FIXED: Auto-refresh recent chats
            setTimeout(() => {
              dispatch(getRecentChat());
            }, 1500);

            if (finalChatId && !hasExistingConversation) {
              setTimeout(() => {
                navigate(`/app/${finalChatId}`, { replace: true });
              }, 1000);
            }
            return;
          }

          // Handle polling for other agents...
          if (!agentResponse || !agentResponse.taskId) {
            throw new Error(
              "Failed to get a valid response from agent service"
            );
          }

          pollAgentTask(agentResponse.taskId, dispatch, {
            interval: 2000,
            maxAttempts: 60,
            onComplete: (data) => {
              handleAgentResponse({
                ...data,
                agentId: selectedAgentId,
                question: currentInput,
              });
            },
            onError: (error) => {
              console.error("Agent task error:", error);
              dispatch(chatAction.popChat());
              dispatch(
                chatAction.chatStart({
                  useInput: {
                    user: currentInput,
                    gemini: `<div>Agent Error: ${error.message}</div>`,
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
        // Handle search modes
        let searchResponse;
        const endpoint =
          searchMode === "deep" ? "/api/deepsearch" : "/api/simplesearch";

        searchResponse = await dispatch(
          sendDeepSearchRequest({
            query: currentInput,
            sources: ["support.zoom.us", "community.zoom.us", "zoom.us"],
            endpoint: endpoint,
            chatHistoryId: chatHistoryId,
          })
        );

        // FIXED: Auto-refresh recent chats
        setTimeout(() => {
          dispatch(getRecentChat());
        }, 2000);

        if (
          searchResponse &&
          searchResponse.chatHistoryId &&
          !hasExistingConversation
        ) {
          setTimeout(() => {
            navigate(`/app/${searchResponse.chatHistoryId}`, { replace: true });
          }, 500);
        }
      } else {
        // Handle regular chat
        const chatResponse = await dispatch(
          sendChatData({
            user: currentInput,
            previousChat: previousChat,
            chatHistoryId: chatHistoryId,
          })
        );

        // FIXED: Auto-refresh recent chats
        setTimeout(() => {
          dispatch(getRecentChat());
        }, 1500);

        if (
          chatResponse &&
          chatResponse.chatHistoryId &&
          !hasExistingConversation
        ) {
          setTimeout(() => {
            navigate(`/app/${chatResponse.chatHistoryId}`, { replace: true });
          }, 500);
        }
      }

      console.log(`[InputSection] Query processing initiated successfully`);
    } catch (error) {
      console.error(`[InputSection] Error submitting query:`, error);
      dispatch(chatAction.popChat());
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: currentInput,
            gemini: `<div>Error: ${error.message}</div>`,
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
      dispatch(chatAction.clearSuggestPrompt());
    }
  }, [suggestPrompt, dispatch]);

  // SIMPLIFIED handleAgentResponse
  const handleAgentResponse = useCallback(
    (data) => {
      let resultText = "";
      if (data.result) {
        if (typeof data.result === "string") {
          resultText = data.result;
        } else {
          resultText = JSON.stringify(data.result, null, 2);
        }
      } else {
        resultText = "Agent returned no result data.";
      }

      const queryKeywords = (data.question || userInput)
        .split(/\s+/)
        .filter((word) => word.length > 3);

      let finalChatHistoryId = data.chatHistoryId || chatHistoryId;
      if (!finalChatHistoryId || finalChatHistoryId.length < 5) {
        finalChatHistoryId = `agent_${Date.now()}_${Math.random()
          .toString(36)
          .substring(2, 9)}`;
      }

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
            isPreformattedHTML: false,
          },
        })
      );

      dispatch(
        chatAction.chatHistoryIdHandler({
          chatHistoryId: finalChatHistoryId,
        })
      );

      if (finalChatHistoryId !== chatHistoryId) {
        setTimeout(() => {
          navigate(`/app/${finalChatHistoryId}`, { replace: true });
        }, 500);
      }

      dispatch(uiAction.setLoading(false));

      // FIXED: Auto-refresh recent chats
      setTimeout(() => {
        dispatch(getRecentChat());
      }, 1000);
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
              isLoaderActive === "yes"
                ? "Please wait for the response..."
                : selectedAgents.length > 0
                ? `${chatHistoryId ? "Continue asking" : "Ask"} ${
                    selectedAgents.length > 1
                      ? "agents"
                      : getAgentDisplayName(selectedAgents[0])
                  }...`
                : searchMode === "simple"
                ? `${
                    chatHistoryId ? "Ask another" : "Ask for a"
                  } quick answer...`
                : `${
                    chatHistoryId ? "Ask for more" : "Ask for"
                  } detailed research...`
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
            {/* FIXED: Removed autocomplete/suggestion boxes that were causing UI issues */}
            <div className={styles["upload-container"]} ref={uploadMenuRef}>
              <button
                type="button"
                className={`${styles["upload-button"]} ${
                  showComingSoonTooltip ? styles["active"] : ""
                }`}
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

              {/* Coming Soon Tooltip - FIXED: Proper positioning */}
              {showComingSoonTooltip && (
                <div className={styles["coming-soon-tooltip"]}>
                  <div className={styles["tooltip-content"]}>
                    <div className={styles["tooltip-header"]}>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none">
                        <path
                          d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span>Coming Soon!</span>
                    </div>
                    <p>
                      File upload feature is in development and will be
                      available in a future release.
                    </p>
                    <div className={styles["tooltip-footer"]}>
                      <span>Stay tuned for updates!</span>
                    </div>
                  </div>
                  <div className={styles["tooltip-arrow"]}></div>
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
                  {isJiraAgent(selectedAgents[0]) && (
                    <span className={styles["jira-badge"]}>JIRA</span>
                  )}
                  {isDayOneStreamingAgent(selectedAgents[0]) && (
                    <span className={styles["streaming-badge"]}>STREAM</span>
                  )}
                  {chatHistoryId && currentChats?.length > 0 && (
                    <span className={styles["conversation-badge"]}>
                      ({currentChats.length} msgs)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={styles["input-help"]}>
        <span>
          Press Shift + Enter for new line
          {chatHistoryId && currentChats?.length > 0 && (
            <span className={styles["conversation-help"]}>
              • Continuing conversation ({currentChats.length} messages)
            </span>
          )}
        </span>
      </div>
    </div>
  );
};

export default InputSection;
