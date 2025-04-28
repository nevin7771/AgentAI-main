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
  const [isShowMoreAgent, setIsShowMoreAgent] = useState(false);
  const [isShowMoreSearch, setIsShowMoreSearch] = useState(false);
  const [isActiveChat, setIsActiveChat] = useState("");
  const [agentHistory, setAgentHistory] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const chatHistoryId = useSelector((state) => state.chat.chatHistoryId);
  const location = useSelector((state) => state.user.location);

  const sideBarWidthHandler = () => {
    dispatch(uiAction.toggleSideBar());
  };

  const showMoreHandler = () => {
    setisShowMore((pre) => !pre);
  };

  const showMoreAgentHandler = () => {
    setIsShowMoreAgent((pre) => !pre);
  };
  
  const showMoreSearchHandler = () => {
    setIsShowMoreSearch((pre) => !pre);
  };

  useEffect(() => {
    const id = chatHistoryId || "";
    setIsActiveChat(id);
  }, [chatHistoryId]);
  
  // Load history from localStorage
  useEffect(() => {
    // Load agent history
    try {
      const storedAgentHistory = localStorage.getItem('agentHistory');
      if (storedAgentHistory) {
        setAgentHistory(JSON.parse(storedAgentHistory));
      }
    } catch (err) {
      console.error('Error loading agent history from localStorage:', err);
    }
    
    // Load search history
    try {
      const storedSearchHistory = localStorage.getItem('searchHistory');
      if (storedSearchHistory) {
        setSearchHistory(JSON.parse(storedSearchHistory));
      }
    } catch (err) {
      console.error('Error loading search history from localStorage:', err);
    }
    
    // Listen for storage events to update sidebar when localStorage changes
    const handleStorageChange = () => {
      try {
        // Update agent history
        const updatedAgentHistory = localStorage.getItem('agentHistory');
        if (updatedAgentHistory) {
          setAgentHistory(JSON.parse(updatedAgentHistory));
        }
        
        // Update search history
        const updatedSearchHistory = localStorage.getItem('searchHistory');
        if (updatedSearchHistory) {
          setSearchHistory(JSON.parse(updatedSearchHistory));
        }
      } catch (err) {
        console.error('Error handling storage change:', err);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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
  const showMoreAgentArrowIcon = isShowMoreAgent ? icon.upArrowIcon : icon.expandIcon;
  const showMoreSearchArrowIcon = isShowMoreSearch ? icon.upArrowIcon : icon.expandIcon;

  console.log("sidebar");

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
      dispatch(deleteChatHistory(chatId));
    }
  };
  
  const deleteAgentChatHandler = (e, chatId) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.confirm("Are you sure you want to delete this agent history?")) {
      dispatch(deleteAgentChatHistory(chatId))
        .then(() => {
          // Update the local state after successful deletion
          setAgentHistory(prevHistory => 
            prevHistory.filter(item => item.id !== chatId)
          );
        })
        .catch(error => {
          console.error("Failed to delete agent history:", error);
          alert("Failed to delete agent history. Please try again.");
        });
    }
  };
  
  const deleteSearchChatHandler = (e, chatId) => {
    e.preventDefault();
    e.stopPropagation();

    if (window.confirm("Are you sure you want to delete this search history?")) {
      dispatch(deleteChatHistory(chatId))
        .then(() => {
          // Update the local state after successful deletion
          setSearchHistory(prevHistory => 
            prevHistory.filter(item => item.id !== chatId)
          );
          
          // Also update localStorage directly
          try {
            const existingHistory = JSON.parse(localStorage.getItem('searchHistory') || '[]');
            const updatedHistory = existingHistory.filter(item => item.id !== chatId);
            localStorage.setItem('searchHistory', JSON.stringify(updatedHistory));
          } catch (err) {
            console.error('Error updating search history in localStorage:', err);
          }
        })
        .catch(error => {
          console.error("Failed to delete search history:", error);
          alert("Failed to delete search history. Please try again.");
        });
    }
  };

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
            <p>Recent</p>

            {recentChat.slice(0, 5).map((chat) => (
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
                  <p>{chat.title.slice(0, 20)}</p>
                  <div
                    className={styles["delete-icon"]}
                    onClick={(e) => deleteChatHandler(e, chat._id)}
                    title="Delete chat">
                    <img src={icon.crossIcon} alt="delete"></img>
                  </div>
                </div>
              </Link>
            ))}
            {recentChat.length > 5 && (
              <div className={styles["show-more"]} onClick={showMoreHandler}>
                <img src={showMoreArrowIcon} alt="drop down"></img>
                <p>Show more</p>
              </div>
            )}

            {isShowMore &&
              recentChat.slice(5, recentChat.length).map((chat) => (
                <Link to={`/app/${chat._id}`} key={chat._id}>
                  <div
                    className={`${styles["recent-chat"]} ${
                      isActiveChat === chat._id
                        ? styles["active-recent-chat"]
                        : ""
                    }`}
                    onClick={() => {
                      setIsActiveChat(chat._id);
                    }}
                    key={chat._id}>
                    <img src={icon.messageIcon} alt="message"></img>
                    <p>{chat.title.slice(0, 20)}</p>
                    <div
                      className={styles["delete-icon"]}
                      onClick={(e) => deleteChatHandler(e, chat._id)}
                      title="Delete chat">
                      <img src={icon.crossIcon} alt="delete"></img>
                    </div>
                  </div>
                </Link>
              ))}
              
            {/* Agent History Section */}
            {agentHistory.length > 0 && (
              <div className={styles["agent-history-section"]}>
                <h3 className={styles["agent-section-title"]}>Agent History</h3>
                
                {agentHistory.slice(0, 5).map((chat) => (
                  <Link to={`/app/${chat.id}`} key={chat.id}>
                    <div
                      className={`${styles["recent-chat"]} ${styles["agent-chat"]} ${
                        isActiveChat === chat.id ? styles["active-recent-chat"] : ""
                      }`}
                      onClick={() => {
                        setIsActiveChat(chat.id);
                      }}>
                      <img src={icon.ideaIcon} alt="agent"></img>
                      <p>{chat.title.slice(0, 20)}</p>
                      <div
                        className={styles["delete-icon"]}
                        onClick={(e) => deleteAgentChatHandler(e, chat.id)}
                        title="Delete agent history">
                        <img src={icon.crossIcon} alt="delete"></img>
                      </div>
                    </div>
                  </Link>
                ))}
                
                {agentHistory.length > 5 && (
                  <div className={styles["show-more"]} onClick={showMoreAgentHandler}>
                    <img src={showMoreAgentArrowIcon} alt="drop down"></img>
                    <p>Show more agents</p>
                  </div>
                )}
                
                {isShowMoreAgent &&
                  agentHistory.slice(5, agentHistory.length).map((chat) => (
                    <Link to={`/app/${chat.id}`} key={chat.id}>
                      <div
                        className={`${styles["recent-chat"]} ${styles["agent-chat"]} ${
                          isActiveChat === chat.id ? styles["active-recent-chat"] : ""
                        }`}
                        onClick={() => {
                          setIsActiveChat(chat.id);
                        }}>
                        <img src={icon.ideaIcon} alt="agent"></img>
                        <p>{chat.title.slice(0, 20)}</p>
                        <div
                          className={styles["delete-icon"]}
                          onClick={(e) => deleteAgentChatHandler(e, chat.id)}
                          title="Delete agent history">
                          <img src={icon.crossIcon} alt="delete"></img>
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            )}
            
            {/* Search History Section */}
            {searchHistory.length > 0 && (
              <div className={styles["search-history-section"]}>
                <h3 className={styles["search-section-title"]}>Search History</h3>
                
                {searchHistory.slice(0, 5).map((chat) => (
                  <Link to={`/app/${chat.id}`} key={chat.id}>
                    <div
                      className={`${styles["recent-chat"]} ${styles["search-chat"]} ${
                        chat.type === 'simple' ? styles["simple-search-chat"] : styles["deep-search-chat"]
                      } ${
                        isActiveChat === chat.id ? styles["active-recent-chat"] : ""
                      }`}
                      onClick={() => {
                        setIsActiveChat(chat.id);
                      }}>
                      <img src={icon.searchIcon || icon.messageIcon} alt="search"></img>
                      <p>{chat.title.slice(0, 20)}</p>
                      <div
                        className={styles["delete-icon"]}
                        onClick={(e) => deleteSearchChatHandler(e, chat.id)}
                        title="Delete search history">
                        <img src={icon.crossIcon} alt="delete"></img>
                      </div>
                    </div>
                  </Link>
                ))}
                
                {searchHistory.length > 5 && (
                  <div className={styles["show-more"]} onClick={showMoreSearchHandler}>
                    <img src={showMoreSearchArrowIcon} alt="drop down"></img>
                    <p>Show more searches</p>
                  </div>
                )}
                
                {isShowMoreSearch &&
                  searchHistory.slice(5, searchHistory.length).map((chat) => (
                    <Link to={`/app/${chat.id}`} key={chat.id}>
                      <div
                        className={`${styles["recent-chat"]} ${styles["search-chat"]} ${
                          chat.type === 'simple' ? styles["simple-search-chat"] : styles["deep-search-chat"]
                        } ${
                          isActiveChat === chat.id ? styles["active-recent-chat"] : ""
                        }`}
                        onClick={() => {
                          setIsActiveChat(chat.id);
                        }}>
                        <img src={icon.searchIcon || icon.messageIcon} alt="search"></img>
                        <p>{chat.title.slice(0, 20)}</p>
                        <div
                          className={styles["delete-icon"]}
                          onClick={(e) => deleteSearchChatHandler(e, chat.id)}
                          title="Delete search history">
                          <img src={icon.crossIcon} alt="delete"></img>
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            )}
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
        {isSidebarLong && (
          <div className={styles["upgrade-gimini"]}>
            <img src={commonIcon.advanceGeminiIcon} alt="gemini-logo"></img>
            <p>Upgrade to Gemini Advanced</p>
          </div>
        )}
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
