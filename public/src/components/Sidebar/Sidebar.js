import styles from "./Sidebar.module.css";
import { themeIcon } from "../../asset";
import { commonIcon } from "../../asset";
import { useSelector, useDispatch } from "react-redux";
import { uiAction } from "../../store/ui-gemini";
import { useEffect, useState, useMemo } from "react";
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

  // Function to load chats from localStorage
  const loadLocalStorageChats = () => {
    try {
      // Check both localStorage items for saved chats
      const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
      const searchHistory = JSON.parse(localStorage.getItem("searchHistory") || "[]");
      
      console.log(`Found ${savedChats.length} saved chats and ${searchHistory.length} search history items in localStorage`);
      
      // Process savedChats
      const formattedSavedChats = savedChats.map(chat => ({
        _id: chat.id,
        title: chat.title,
        searchType: chat.searchType || "agent",
        isSearch: true,
        fromLocalStorage: true,
        timestamp: chat.timestamp || new Date().toISOString()
      }));
      
      // Process searchHistory items
      const formattedSearchHistory = searchHistory.map(item => ({
        _id: item.id,
        title: item.title,
        searchType: item.type || "search",
        isSearch: true,
        fromLocalStorage: true,
        timestamp: item.timestamp || new Date().toISOString()
      }));
      
      // Combine both sources
      const allLocalChats = [...formattedSavedChats, ...formattedSearchHistory];
      
      if (allLocalChats.length > 0) {
        // Filter out duplicates (same ID) and keep the most recent ones
        const uniqueChats = [];
        const seenIds = new Set();
        
        for (const chat of allLocalChats) {
          if (!seenIds.has(chat._id)) {
            seenIds.add(chat._id);
            uniqueChats.push(chat);
          }
        }
        
        // Sort chats by timestamp (most recent first)
        uniqueChats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Filter out items that already exist in recentChat
        const existingIds = recentChat.map(chat => chat._id);
        const newChats = uniqueChats.filter(chat => !existingIds.includes(chat._id));
        
        if (newChats.length > 0 || uniqueChats.length !== recentChat.length) {
          console.log(`Adding ${newChats.length} chats from localStorage to recent chats`);
          
          // Create a completely new combined chats array with proper sorting
          const combinedChats = [...recentChat.filter(chat => !chat.fromLocalStorage), ...uniqueChats];
          
          // Sort by timestamp again after combining
          combinedChats.sort((a, b) => {
            const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
            const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
            return dateB - dateA;
          });
          
          // Update Redux store with combined chats for sidebar display
          dispatch(chatAction.recentChatHandler({ recentChat: combinedChats }));
        }
      }
    } catch (err) {
      console.error("Error loading saved chats from localStorage:", err);
    }
  };

  // Listen for storage events to update sidebar
  useEffect(() => {
    const handleStorageChange = () => {
      console.log("Storage changed, reloading chat history");
      loadLocalStorageChats();
    };
    
    // Initial load
    loadLocalStorageChats();
    
    // Listen for storage events
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [dispatch]);
  
  // Also reload when recentChat changes
  useEffect(() => {
    loadLocalStorageChats();
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
        // First, remove from both localStorage collections if present
        try {
          // Remove from savedChats
          const savedChats = JSON.parse(localStorage.getItem("savedChats") || "[]");
          const filteredSavedChats = savedChats.filter(chat => chat.id !== chatId);
          localStorage.setItem("savedChats", JSON.stringify(filteredSavedChats));
          
          // Remove from searchHistory
          const searchHistory = JSON.parse(localStorage.getItem("searchHistory") || "[]");
          const filteredSearchHistory = searchHistory.filter(item => item.id !== chatId);
          localStorage.setItem("searchHistory", JSON.stringify(filteredSearchHistory));
          
          console.log(`Removed chat ${chatId} from localStorage collections`);
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

  // Deduplicate chats by ID to avoid rendering duplicates
  const allChats = (() => {
    const seen = new Set();
    const unique = [];
    recentChat.forEach(chat => {
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
