import styles from "./Sidebar.module.css";
import { themeIcon } from "../../asset";
import { commonIcon } from "../../asset";
import { useSelector, useDispatch } from "react-redux";
import { uiAction } from "../../store/ui-gemini";
import { useEffect, useState } from "react";
import { chatAction } from "../../store/chat";
import { Link, useNavigate } from "react-router-dom";
import { userUpdateLocation } from "../../store/user-action";
import { deleteChatHistory } from "../../store/chat-action";
import { deleteAgentChatHistory } from "../../store/agent-actions";

const Sidebar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isSidebarLong = useSelector((state) => state.ui.isSidebarLong);
  const isNewChat = useSelector((state) => state.chat.newChat);
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

  // Only need a single show more handler now

  useEffect(() => {
    const id = chatHistoryId || "";
    setIsActiveChat(id);
  }, [chatHistoryId]);

  // No need to categorize chats anymore - all in one list
  useEffect(() => {
    // Just set active chat when chatHistoryId changes
    const id = chatHistoryId || "";
    setIsActiveChat(id);
  }, [chatHistoryId]);

  // Check for chats saved in localStorage and merge with recentChat
  useEffect(() => {
    // Check if we have saved chats in localStorage
    try {
      const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
      
      if (savedChats.length > 0) {
        console.log(`Found ${savedChats.length} saved chats in localStorage to merge with recentChat`);
        
        // Only process if we have actual data
        if (savedChats.length > 0) {
          // Convert format to match recentChat format for display
          const formattedChats = savedChats.map(chat => ({
            _id: chat.id,
            title: chat.title,
            searchType: chat.searchType || "agent",
            isSearch: true,
            // Keep these properties for proper rendering
            fromLocalStorage: true
          }));
          
          // Filter out items that already exist in recentChat
          const existingIds = recentChat.map(chat => chat._id);
          const newChats = formattedChats.filter(chat => !existingIds.includes(chat._id));
          
          if (newChats.length > 0) {
            console.log(`Adding ${newChats.length} chats from localStorage to recent chats`);
            
            // Combine with existing recentChat, preserving the array reference
            const combinedChats = [...recentChat, ...newChats];
            
            // Update Redux store with combined chats for sidebar display
            dispatch(chatAction.recentChatHandler({ recentChat: combinedChats }));
          }
        }
      }
    } catch (err) {
      console.error("Error loading saved chats from localStorage:", err);
    }
  }, [recentChat.length, dispatch]);

  const settingsHandler = (e) => {
    dispatch(uiAction.toggleSettings());
    if (e.view.innerWidth <= 960) {
      dispatch(uiAction.toggleSideBar());
    }
  };

  const newChatHandler = () => {
    dispatch(chatAction.replaceChat({ chats: [] }));
    dispatch(chatAction.newChatHandler());
    dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: "" }));
    navigate("/");
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

  // Chat delete handler that works with both localStorage and MongoDB
  const deleteChatHandler = (e, chatId) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.confirm("Are you sure you want to delete this chat history?")) {
      try {
        // First, remove from localStorage if present
        try {
          const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
          const filteredChats = savedChats.filter(chat => chat.id !== chatId);
          localStorage.setItem("savedChats", JSON.stringify(filteredChats));
          console.log(`Removed chat ${chatId} from localStorage if present`);
        } catch (err) {
          console.error("Error removing from localStorage:", err);
        }

        // Now, remove from server if possible
        const deleteAction = dispatch(deleteChatHistory(chatId));

        // Check if we got a valid Promise back
        if (deleteAction && typeof deleteAction.then === "function") {
          deleteAction
            .then(() => {
              console.log(`Successfully deleted chat history ${chatId} from server`);
              
              // Update the recentChat list in Redux store to remove this chat
              dispatch(
                chatAction.recentChatHandler({
                  recentChat: recentChat.filter(chat => chat._id !== chatId)
                })
              );

              // If currently viewing the deleted chat, navigate to home
              if (chatId === chatHistoryId) {
                navigate("/");
              }
            })
            .catch((error) => {
              console.error(`Server delete failed: ${error}, falling back to client-side removal`);
              
              // Even if server delete fails, update the UI
              dispatch(
                chatAction.recentChatHandler({
                  recentChat: recentChat.filter(chat => chat._id !== chatId)
                })
              );
              
              // If currently viewing the deleted chat, navigate to home
              if (chatId === chatHistoryId) {
                navigate("/");
              }
            });
        } else {
          console.warn("deleteChatHistory did not return a Promise, using client-side removal");
          
          // Remove from UI directly
          dispatch(
            chatAction.recentChatHandler({
              recentChat: recentChat.filter(chat => chat._id !== chatId)
            })
          );

          // If currently viewing the deleted chat, navigate to home anyway
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

  // Show all chats together now
  const allChats = recentChat;

  return (
    <div className={`${styles["sidebar-main"]} ${styles[sideBarWidthClass]}`}>
      <div className={styles["menu-icon"]} onClick={sideBarWidthHandler}>
        <img src={icon.menuIcon} alt="menu icon"></img>
      </div>

      <div className={styles["recent-chat-section"]}>
        {isNewChat ? (
          <div
            onClick={newChatHandler}
            className={`${styles["pluc-icon"]} ${styles["new-plus-icon"]}`}>
            <img src={icon.plusIcon} alt="plus icon"></img>
            {isSidebarLong && <p>New chat</p>}
          </div>
        ) : (
          <div className={`${styles["pluc-icon"]} ${styles["old-plus-icon"]}`}>
            <img src={icon.plusIcon} alt="plus icon"></img>
            {isSidebarLong && <p>New chat</p>}
          </div>
        )}
        {isSidebarLong && (
          <div className={styles["recent-chat-main"]}>
            {allChats.length > 0 && <p>Recent</p>}

            {allChats.slice(0, 5).map((chat) => (
              <Link to={`/app/${chat._id}`} key={chat._id}>
                <div
                  className={`${styles["recent-chat"]} ${
                    isActiveChat === chat._id
                      ? styles["active-recent-chat"]
                      : ""
                  }`}
                  onClick={() => {
                    setIsActiveChat(chat._id);
                  }}>
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
                    className={`${styles["recent-chat"]} ${
                      isActiveChat === chat._id
                        ? styles["active-recent-chat"]
                        : ""
                    }`}
                    onClick={() => {
                      setIsActiveChat(chat._id);
                    }}>
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

            {/* All chats shown in recent section */}
          </div>
        )}
      </div>

      <div className={styles["settings-section"]}>
        <div className={styles["help"]}>
          <img src={icon.helpIcon} alt="help icon"></img>
          {isSidebarLong && <p>Help</p>}
        </div>
        <div className={styles["activity"]}>
          <img src={icon.activityIcon} alt="activity icon"></img>
          {isSidebarLong && <p>Activity</p>}
        </div>
        <div className={styles["settings"]} onClick={settingsHandler}>
          <img src={icon.settingsIcon} alt="settings icon"></img>
          {isSidebarLong && <p>Settings</p>}
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
