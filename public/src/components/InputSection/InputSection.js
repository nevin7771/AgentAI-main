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
  const inputRef = useRef(null);
  const previousChat = useSelector((state) => state.chat.previousChat);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const suggestPrompt = useSelector((state) => state.chat.suggestPrompt);

  const userInputHandler = (e) => {
    setUserInput(e.target.value);
  };

  const toggleDeepSearch = () => {
    setIsDeepSearch(!isDeepSearch);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 0);
  };

  const handleFileUpload = () => {
    // TODO: Implement file upload functionality
    console.log("File upload clicked");
  };

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
        <button
          type="button"
          className={styles["upload-button"]}
          onClick={handleFileUpload}
          title="Upload files">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 4V20M4 12H20"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <form onSubmit={onSubmitHandler} className={styles["input-form"]}>
          <input
            ref={inputRef}
            value={userInput}
            onChange={userInputHandler}
            autoComplete="off"
            type="text"
            placeholder="Ask Vista"
            className={styles["input-field"]}
          />
        </form>

        <div className={styles["button-group"]}>
          <button
            type="button"
            className={`${styles["deep-search-btn"]} ${
              isDeepSearch ? styles["active"] : ""
            }`}
            onClick={toggleDeepSearch}>
            Deep search
          </button>

          <button
            type="submit"
            className={styles["send-button"]}
            onClick={onSubmitHandler}
            disabled={!userInput.trim()}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path
                d="M2 12L20 12M20 12L14 6M20 12L14 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default InputSection;
