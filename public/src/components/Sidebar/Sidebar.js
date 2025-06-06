import styles from "./Sidebar.module.css";
import { themeIcon } from "../../asset";
import { useSelector, useDispatch } from "react-redux";
import { uiAction } from "../../store/ui-gemini";
import { useEffect, useState, useCallback } from "react";
import { chatAction } from "../../store/chat";
import { agentAction } from "../../store/agent";
import { Link, useNavigate } from "react-router-dom";
import { userUpdateLocation } from "../../store/user-action";
import { deleteChatHistory } from "../../store/chat-action";

const Sidebar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isSidebarLong = useSelector((state) => state.ui.isSidebarLong);
  // FIXED: Removed unused isNewChat variable
  const recentChat = useSelector((state) => state.chat.recentChat);
  const [isShowMore, setisShowMore] = useState(false);
  const [isActiveChat, setIsActiveChat] = useState("");
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const location = useSelector((state) => state.user.location);

  const sideBarWidthHandler = () => {
    dispatch(uiAction.toggleSideBar());
  };

  const showMoreHandler = () => {
    setisShowMore((pre) => !pre);
  };

  useEffect(() => {
    const id = chatHistoryId || "";
    setIsActiveChat(id);
  }, [chatHistoryId]);

  // Function to load chats from localStorage
  const loadLocalStorageChats = useCallback(() => {
    try {
      const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
      const searchHistory = JSON.parse(
        localStorage.getItem("searchHistory") || "[]"
      );

      const formattedSavedChats = savedChats.map((chat) => ({
        _id: chat.id,
        title: chat.title,
        searchType: chat.searchType || "agent",
        agentType: chat.agentType || null,
        isSearch: true,
        fromLocalStorage: true,
        timestamp: chat.timestamp || new Date().toISOString(),
      }));

      const formattedSearchHistory = searchHistory.map((item) => ({
        _id: item.id,
        title: item.title,
        searchType: item.type || "search",
        agentType: item.agentType || null,
        isSearch: true,
        fromLocalStorage: true,
        timestamp: item.timestamp || new Date().toISOString(),
      }));

      const allLocalChats = [...formattedSavedChats, ...formattedSearchHistory];
      const uniqueChats = [];
      const seenIds = new Set();

      for (const chat of allLocalChats) {
        if (!seenIds.has(chat._id)) {
          seenIds.add(chat._id);
          uniqueChats.push(chat);
        }
      }
      uniqueChats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      const localChatsFromRedux = recentChat.filter(
        (c) => c.fromLocalStorage === true
      );
      const uniqueChatsIdsString = uniqueChats
        .map((c) => c._id)
        .sort()
        .join(",");
      const localChatsFromReduxIdsString = localChatsFromRedux
        .map((c) => c._id)
        .sort()
        .join(",");

      if (uniqueChatsIdsString !== localChatsFromReduxIdsString) {
        const combinedChats = [
          ...recentChat.filter((chat) => !chat.fromLocalStorage),
          ...uniqueChats,
        ];
        combinedChats.sort((a, b) => {
          const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
          const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
          return dateB - dateA;
        });
        dispatch(chatAction.recentChatHandler({ recentChat: combinedChats }));
      } else if (allLocalChats.length === 0 && localChatsFromRedux.length > 0) {
        const combinedChats = recentChat.filter(
          (chat) => !chat.fromLocalStorage
        );
        dispatch(chatAction.recentChatHandler({ recentChat: combinedChats }));
      }
    } catch (err) {
      console.error("Error loading saved chats from localStorage:", err);
    }
  }, [dispatch, recentChat]);

  // Listen for storage events
  useEffect(() => {
    const handleStorageChange = () => {
      loadLocalStorageChats();
    };

    loadLocalStorageChats();
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadLocalStorageChats]);

  // FIXED: Removed unused settingsHandler function

  const helpHandler = () => {
    const zoomChatUrl =
      "https://zoom.us/launch/chat/v2/eyJzaWQiOiI0YWQ5ZTllZGY4ODY0NjAzOTI1MjI5ODY1ZGVhNzdmNUBjb25mZXJlbmNlLnhtcHAuem9vbS51cyJ9";

    try {
      const newWindow = window.open(
        zoomChatUrl,
        "_blank",
        "noopener,noreferrer"
      );

      if (
        !newWindow ||
        newWindow.closed ||
        typeof newWindow.closed === "undefined"
      ) {
        window.location.href = zoomChatUrl;
      }
    } catch (error) {
      console.error("Error opening Zoom chat:", error);
      window.location.href = zoomChatUrl;
    }
  };

  const newChatHandler = () => {
    dispatch(chatAction.replaceChat({ chats: [] }));
    dispatch(chatAction.newChatHandler());
    dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: "" }));
    dispatch(agentAction.clearSelectedAgents());
    navigate("/");
  };

  // Function to get chat styling class based on agent type
  const getChatStyleClass = (chat) => {
    if (!chat.isSearch) {
      return ""; // Regular chat, no special styling
    }

    // Determine agent type from chat data
    let agentType = chat.agentType;

    // Fallback detection for older chats without agentType
    if (!agentType && chat.title) {
      if (
        chat.title.toLowerCase().includes("jira") ||
        chat.title.startsWith("Jira:")
      ) {
        agentType = "jira_ag";
      } else if (chat.title.toLowerCase().includes("confluence")) {
        agentType = "conf_ag";
      } else if (chat.title.toLowerCase().includes("monitor")) {
        agentType = "monitor_ag";
      }
    }

    // Apply styling based on agent type
    if (agentType === "jira_ag") {
      return `${styles["agent-chat"]} ${styles["jira-agent-chat"]}`;
    } else if (agentType === "conf_ag" || agentType === "monitor_ag") {
      return `${styles["agent-chat"]} ${styles["confluence-monitor-chat"]}`;
    } else if (chat.searchType === "agent") {
      return `${styles["agent-chat"]}`;
    } else if (chat.searchType === "simple") {
      return `${styles["search-chat"]} ${styles["simple-search-chat"]}`;
    } else if (chat.searchType === "deep") {
      return `${styles["search-chat"]} ${styles["deep-search-chat"]}`;
    }

    return styles["search-chat"];
  };

  // Function to auto-select agent when clicking chat
  const handleChatClick = (chat) => {
    setIsActiveChat(chat._id);

    // Auto-select agent based on chat type
    if (chat.isSearch && chat.agentType) {
      console.log(`[Sidebar] Auto-selecting agent: ${chat.agentType}`);
      dispatch(agentAction.clearSelectedAgents());
      dispatch(agentAction.addSelectedAgent(chat.agentType));
    } else if (chat.isSearch && chat.title) {
      // Fallback detection for older chats
      let agentToSelect = null;
      if (
        chat.title.toLowerCase().includes("jira") ||
        chat.title.startsWith("Jira:")
      ) {
        agentToSelect = "jira_ag";
      } else if (chat.title.toLowerCase().includes("confluence")) {
        agentToSelect = "conf_ag";
      } else if (chat.title.toLowerCase().includes("monitor")) {
        agentToSelect = "monitor_ag";
      }

      if (agentToSelect) {
        console.log(
          `[Sidebar] Auto-selecting agent (fallback): ${agentToSelect}`
        );
        dispatch(agentAction.clearSelectedAgents());
        dispatch(agentAction.addSelectedAgent(agentToSelect));
      }
    } else {
      // Regular chat - clear agent selection
      dispatch(agentAction.clearSelectedAgents());
    }
  };

  const icon = themeIcon();
  const sideBarWidthClass = isSidebarLong ? "side-bar-long" : "side-bar-sort";
  const showMoreArrowIcon = isShowMore ? icon.upArrowIcon : icon.expandIcon;

  const updateLocationHandler = () => {
    const location = localStorage.getItem("location");
    if (!location) {
      dispatch(userUpdateLocation());
    }
  };

  const deleteChatHandler = (e, chatId) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.confirm("Are you sure you want to delete this chat history?")) {
      try {
        try {
          const savedChats = JSON.parse(
            localStorage.getItem("savedChats") || "[]"
          );
          const filteredSavedChats = savedChats.filter(
            (chat) => chat.id !== chatId
          );
          localStorage.setItem(
            "savedChats",
            JSON.stringify(filteredSavedChats)
          );

          const searchHistory = JSON.parse(
            localStorage.getItem("searchHistory") || "[]"
          );
          const filteredSearchHistory = searchHistory.filter(
            (item) => item.id !== chatId
          );
          localStorage.setItem(
            "searchHistory",
            JSON.stringify(filteredSearchHistory)
          );
        } catch (err) {
          console.error("Error removing from localStorage:", err);
        }

        const deleteAction = dispatch(deleteChatHistory(chatId));

        if (deleteAction && typeof deleteAction.then === "function") {
          deleteAction
            .then(() => {
              dispatch(
                chatAction.recentChatHandler({
                  recentChat: recentChat.filter((chat) => chat._id !== chatId),
                })
              );
              if (chatId === chatHistoryId) {
                navigate("/");
              }
            })
            .catch((error) => {
              console.error(
                `Server delete failed: ${error}, falling back to client-side removal`
              );
              dispatch(
                chatAction.recentChatHandler({
                  recentChat: recentChat.filter((chat) => chat._id !== chatId),
                })
              );
              if (chatId === chatHistoryId) {
                navigate("/");
              }
            });
        } else {
          dispatch(
            chatAction.recentChatHandler({
              recentChat: recentChat.filter((chat) => chat._id !== chatId),
            })
          );
          if (chatId === chatHistoryId) {
            navigate("/");
          }
        }
      } catch (error) {
        console.error("Failed to delete chat history:", error);
        alert("Failed to delete chat history. Please try again.");
      }
    }
  };

  const allChats = (() => {
    const seen = new Set();
    const unique = [];
    recentChat.forEach((chat) => {
      if (!seen.has(chat._id)) {
        seen.add(chat._id);
        unique.push(chat);
      }
    });
    return unique;
  })();

  return (
    <div className={`${styles["sidebar-main"]} ${styles[sideBarWidthClass]}`}>
      <div className={styles["menu-icon"]} onClick={sideBarWidthHandler}>
        <img src={icon.menuIcon} alt="menu icon"></img>
      </div>

      <div className={styles["recent-chat-section"]}>
        <div
          onClick={newChatHandler}
          className={`${styles["pluc-icon"]} ${styles["new-plus-icon"]}`}>
          <img src={icon.plusIcon} alt="plus icon"></img>
          {isSidebarLong && <p>New chat</p>}
        </div>
        {isSidebarLong && (
          <div className={styles["recent-chat-main"]}>
            {allChats.length > 0 && <p>Recent</p>}

            {allChats.slice(0, 5).map((chat) => (
              <Link to={`/app/${chat._id}`} key={chat._id}>
                <div
                  className={`${styles["recent-chat"]} ${getChatStyleClass(
                    chat
                  )} ${
                    isActiveChat === chat._id
                      ? styles["active-recent-chat"]
                      : ""
                  }`}
                  onClick={() => handleChatClick(chat)}>
                  <img src={icon.messageIcon} alt="message"></img>
                  <p>{chat.title?.slice(0, 20) || "Chat"}</p>
                  <div
                    className={styles["delete-icon"]}
                    onClick={(e) => deleteChatHandler(e, chat._id)}
                    title="Delete chat">
                    <img src={icon.crossIcon} alt="delete"></img>
                  </div>
                </div>
              </Link>
            ))}
            {allChats.length > 5 && (
              <div className={styles["show-more"]} onClick={showMoreHandler}>
                <img src={showMoreArrowIcon} alt="drop down"></img>
                <p>Show more</p>
              </div>
            )}

            {isShowMore &&
              allChats.slice(5, allChats.length).map((chat) => (
                <Link to={`/app/${chat._id}`} key={chat._id}>
                  <div
                    className={`${styles["recent-chat"]} ${getChatStyleClass(
                      chat
                    )} ${
                      isActiveChat === chat._id
                        ? styles["active-recent-chat"]
                        : ""
                    }`}
                    onClick={() => handleChatClick(chat)}>
                    <img src={icon.messageIcon} alt="message"></img>
                    <p>{chat.title?.slice(0, 20) || "Chat"}</p>
                    <div
                      className={styles["delete-icon"]}
                      onClick={(e) => deleteChatHandler(e, chat._id)}
                      title="Delete chat">
                      <img src={icon.crossIcon} alt="delete"></img>
                    </div>
                  </div>
                </Link>
              ))}
          </div>
        )}
      </div>

      <div className={styles["settings-section"]}>
        <div className={styles["help"]} onClick={helpHandler}>
          <img src={icon.helpIcon} alt="help icon"></img>
          {isSidebarLong && <p>Help</p>}
        </div>
        <div className={styles["location"]} onClick={updateLocationHandler}>
          <div className={styles["dot"]}>
            <img src={icon.dotIcon} alt="dot icon"></img>
          </div>
          <p>
            <span className={styles["location-name"]}>{location}</span> From
            your IP address <span className={styles["span-dot"]}>.</span>
            <span> Update location</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
