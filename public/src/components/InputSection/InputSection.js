// public/src/components/InputSection/InputSection.js
import styles from "./InputSection.module.css";
import { sendDeepSearchRequest } from "../../store/chat-action";
import { sendAgentQuestion } from "../../store/agent-actions";
import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

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

  const onSubmitHandler = (e) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    // If agents are selected, route to agent API instead of simple/deep search
    if (selectedAgents.length > 0) {
      dispatch(
        sendAgentQuestion({
          question: userInput,
          agents: selectedAgents,
          chatHistoryId,
        })
      );
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

  return (
    <div className={styles["input-container"]}>
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
                  title="Get a concise answer (300 words max)">
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
