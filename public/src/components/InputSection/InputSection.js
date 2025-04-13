import styles from "./InputSection.module.css";
import { sendChatData, sendDeepSearchRequest } from "../../store/chat-action";
import { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

const InputSection = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [userInput, setUserInput] = useState("");
  const [isDeepSearch, setIsDeepSearch] = useState(false);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const inputRef = useRef(null);
  const uploadMenuRef = useRef(null);
  const previousChat = useSelector((state) => state.chat.previousChat);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const suggestPrompt = useSelector((state) => state.chat.suggestPrompt);

  const userInputHandler = (e) => {
    setUserInput(e.target.value);
  };

  const toggleDeepSearch = () => {
    setIsDeepSearch(!isDeepSearch);
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

    if (isDeepSearch) {
      dispatch(
        sendDeepSearchRequest({
          query: userInput,
          sources: ["support.zoom.us", "community.zoom.us", "zoom.us"],
        })
      );
    } else {
      dispatch(
        sendChatData({
          user: userInput,
          gemini: "",
          isLoader: "yes",
          previousChat,
          chatHistoryId,
        })
      );
    }

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
            placeholder="Ask Gemini"
            className={styles["input-field"]}
          />
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

            <button
              type="button"
              className={`${styles["deep-search-btn"]} ${
                isDeepSearch ? styles["active"] : ""
              }`}
              onClick={toggleDeepSearch}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Deep Research
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InputSection;
