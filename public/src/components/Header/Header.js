// public/src/components/Header/Header.js - Update the logo click handler

import React from "react";
import styles from "./Header.module.css";
import { useDispatch, useSelector } from "react-redux";
import { uiAction } from "../../store/ui-gemini";
import { themeIcon } from "../../asset";
import { useNavigate } from "react-router-dom";
import { chatAction } from "../../store/chat";
import { continueWithOktaOauth } from "../../utils/getOktaAuthUrl";

const Header = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isNewChat = useSelector((state) => state.chat.newChat);
  const isUserDetails = useSelector((state) => state.ui.isUserDetailsShow);
  const isLogin = useSelector((state) => state.auth.isLogin);
  const userDetails = useSelector((state) => state.user.user);

  const toggleSideBarHandler = () => {
    dispatch(uiAction.toggleSideBar());
  };

  const toggleAadvanceGeminiHandler = () => {
    dispatch(uiAction.toggleAdvanceShow());
  };

  // Updated to handle both clicking the logo AND toggling advanced settings
  const handleLogoClick = () => {
    // First toggle the advanced settings if needed
    dispatch(uiAction.toggleAdvanceShow());

    // Then create a new chat and navigate to home page
    dispatch(chatAction.replaceChat({ chats: [] }));
    dispatch(chatAction.newChatHandler());
    dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: "" }));
    navigate("/");
  };

  const icon = themeIcon();

  const newChatHandler = () => {
    dispatch(chatAction.replaceChat({ chats: [] }));
    dispatch(chatAction.newChatHandler());
    dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: "" }));
    navigate("/");
  };

  const userDetailsOpen = () => {
    dispatch(uiAction.toggleUserDetailsShow());
  };

  const loginHandler = () => {
    window.open(continueWithOktaOauth(), "_self");
  };

  const getFirstName = (fullName) => {
    return fullName?.split(" ")[0] || "User";
  };

  return (
    <div className={styles["header-main"]}>
      <div className={styles["left-section"]}>
        <div className={styles["menu-icon"]} onClick={toggleSideBarHandler}>
          <img src={icon.menuIcon} alt="menu icon"></img>
        </div>
        {/* Updated to use the new function for logo click */}
        <div className={styles["name"]} onClick={handleLogoClick}>
          <p>Vista</p>
          <img src={icon.dropIconSmall} alt="drop down button"></img>
        </div>
      </div>
      <div className={styles["right-section"]}>
        {isNewChat ? (
          <div
            onClick={newChatHandler}
            className={`${styles["plus-icon"]} ${styles["new-plus-icon"]}`}>
            <img src={icon.plusIcon} alt="plus icon"></img>
          </div>
        ) : null}

        {!isLogin ? (
          <div className={styles["login"]} onClick={loginHandler}>
            <div className={styles.zoomLogo}>Z</div>
            <p>Sign in</p>
          </div>
        ) : (
          <div className={styles.userSection}>
            <div className={styles.userName}>
              {getFirstName(userDetails?.name)}
            </div>
            <div
              onClick={userDetailsOpen}
              className={`${styles["user"]} ${
                isUserDetails ? styles["clicked-user"] : ""
              }`}>
              {userDetails?.profileImg ? (
                <img src={userDetails.profileImg} alt={userDetails.name} />
              ) : (
                <div className={styles.defaultAvatar}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z"
                      fill="#0B5CFF"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Header;
