import styles from "./ScrollChat.module.css";
import { commonIcon } from "../../../asset";
import { useSelector, useDispatch } from "react-redux";
import React, { useRef, useEffect, Fragment, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getChat } from "../../../store/chat-action";
import { chatAction } from "../../../store/chat";
import ReplyByGemini from "./ReplyByGemini";
import NewChatByGemini from "./NewChatGemini";
import CopyBtn from "../../Ui/CopyBtn";
import "./ScrollChatModule.css";

const ScrollChat = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { historyId } = useParams();
  const chatRef = useRef(null);
  const chat = useSelector((state) => state.chat.chats);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const realTimeResponse = localStorage.getItem("realtime") || "no";
  const userImage = useSelector((state) => state.user.user.profileImg);
  const [chatType, setChatType] = useState(null); // "regular", "agent", or "search"

  const userLogo = userImage || commonIcon.avatarIcon;

  useEffect(() => {
    if (chat.length === 0 && !historyId) {
      navigate("/");
    } else if (historyId && historyId !== chatHistoryId) {
      // Try to load from server first
      dispatch(getChat(historyId)).catch((error) => {
        console.error("Server get chat failed, checking localStorage:", error);

        // If server fetch fails, check localStorage
        try {
          const savedChats = JSON.parse(
            localStorage.getItem("savedChats") || "[]"
          );
          const savedChat = savedChats.find((chat) => chat.id === historyId);

          if (savedChat) {
            console.log("Found chat in localStorage, restoring:", savedChat);

            // Restore from localStorage
            dispatch(
              chatAction.replaceChat({
                chats: [
                  {
                    user: savedChat.user,
                    gemini: savedChat.gemini,
                    isSearch: true,
                    searchType: savedChat.searchType || "agent",
                    id: Date.now(), // Just for rendering purposes
                  },
                ],
              })
            );

            // Set chat history ID
            dispatch(
              chatAction.chatHistoryIdHandler({
                chatHistoryId: historyId,
              })
            );
          }
        } catch (err) {
          console.error("Error restoring from localStorage:", err);
          navigate("/");
        }
      });
    } else {
      navigate(`/app/${chatHistoryId}`);
    }
  }, [dispatch, historyId, chatHistoryId, navigate, chat]);

  // Detect the chat type based on the chat history ID or chat content
  useEffect(() => {
    if (chatHistoryId) {
      if (chatHistoryId.startsWith("agent_")) {
        setChatType("agent");
      } else if (chat.length > 0 && chat[0]?.searchType) {
        setChatType(chat[0].searchType);
      } else {
        setChatType("regular");
      }
    }
  }, [chatHistoryId, chat]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chat]);

  const loadText = (text) => {
    return text
      ?.replace(/\n/g, "<br>")
      ?.replace(/\*\*(.*?)\*\*/g, '<span class="h1-bold">$1</span>')
      ?.replace(/<br>\*/g, "<br><span class='list'>&#9898;</span>")
      ?.replace(/```([\s\S]*?)```/g, (_, codeBlock) => {
        let code = codeBlock
          .replace(/<br>/g, "\n")
          .replace(/</g, "&#60;")
          .replace(/>/g, "&#62;");
        let highlighted = `\`\`\`` + code + `\`\`\``;
        return `<br><pre><code>${highlighted}</code></pre>`;
      })
      ?.replace(/```([\s\S]*?)```/g, "<br><div class='email-div'>$1</div>");
  };

  const lastElemetId = chat[chat.length - 1]?.id;

  // Handle chat deletion - removed from UI per requirements

  // Get the chat type label
  const getChatTypeLabel = () => {
    switch (chatType) {
      case "agent":
        return "Agent Chat";
      case "simple":
        return "Simple Search";
      case "deep":
        return "Deep Search";
      default:
        return "Chat";
    }
  };

  const chatSection = chat.map((c, index) => (
    <Fragment key={c?.id}>
      {!c.error ? (
        <div
          className={`${styles["single-chat"]} ${
            index === chat.length - 1 ? styles["last-single-chat"] : ""
          }`}>
          <div className={styles["user"]}>
            <img src={userLogo} alt="avatar icon"></img>
            <p>{c.user}</p>
          </div>
          <div className={styles["gemini"]}>
            {/* Show the Bard sparkle icon or loader */}
            <img
              src={
                c?.isLoader === "yes"
                  ? commonIcon.geminiLaoder
                  : c?.searchType === "agent"
                  ? commonIcon.advanceGeminiIcon
                  : commonIcon.chatGeminiIcon
              }
              alt={
                c?.isLoader === "yes"
                  ? "Loading..."
                  : c?.searchType === "agent"
                  ? "Agent"
                  : "Gemini"
              }
              className={c?.isLoader === "yes" ? "loading-icon" : ""}
            />
            {c?.isDeepSearch || c?.isSearch ? (
              // For search results, which already contain HTML
              <div
                className={`search-result ${
                  c?.searchType === "agent" ? "agent-result" : ""
                } ${c?.usedCache ? "cached-result" : ""}`}>
                {c?.usedCache && (
                  <div className="cache-indicator">Cached Result</div>
                )}
                {c?.searchType === "agent" && (
                  <div className="agent-indicator">Agent Response</div>
                )}
                <div dangerouslySetInnerHTML={{ __html: c?.gemini }} />
              </div>
            ) : c?.newChat &&
              !c?.gemini.includes("```") &&
              lastElemetId === c?.id &&
              realTimeResponse === "no" ? (
              <ReplyByGemini gemini={loadText(c?.gemini)} />
            ) : (
              <NewChatByGemini gemini={loadText(c?.gemini)} />
            )}
          </div>
          {c?.gemini?.length > 0 && <CopyBtn data={c?.gemini} />}
        </div>
      ) : (
        navigate("/")
      )}
    </Fragment>
  ));

  // Remove delete button from chat interface per requirements
  return (
    <div className={styles["scroll-chat-main"]} ref={chatRef}>
      {/* Only show chat type indicator */}
      {chatHistoryId && chatHistoryId.length > 0 && chat.length > 0 && (
        <div className={styles["chat-actions"]}>
          <div className={styles["chat-type-indicator"]}>
            {chatType === "agent" ? (
              <div className={styles["agent-indicator"]}>
                <img src={commonIcon.advanceGeminiIcon} alt="Agent icon" />
              </div>
            ) : chatType === "simple" || chatType === "deep" ? (
              <div className={styles["search-indicator"]}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  {chatType === "simple" ? "Simple Search" : "Deep Search"}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      )}
      {chatSection}
    </div>
  );
};

export default ScrollChat;
