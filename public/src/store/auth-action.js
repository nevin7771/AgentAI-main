import { authAction } from "./auth";
import { userAction } from "./user";
import { chatAction } from "./chat";
import { apiFetch } from '../utils/apiHelper';

export const loginHandler = () => {
  return (dispatch) => {
    console.log("Checking auth status");

    apiFetch('/auth/me', {
      method: "GET",
    })
      .then((response) => {
        console.log("Auth response status:", response.status);
        if (!response.ok) {
          throw new Error(`Invalid Credential: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("Auth success, user data:", data);
        dispatch(
          userAction.setUserData({
            userData: {
              name: data.name,
              email: data.email,
              profileImg: data.profileImg,
            },
          })
        );
        dispatch(authAction.isLoginHandler({ isLogin: true }));
        localStorage.setItem("isLogin", true);
      })
      .catch((err) => {
        console.error("Auth error details:", err);
        dispatch(authAction.isLoginHandler({ isLogin: false }));
        localStorage.removeItem("isLogin");
        localStorage.removeItem("loginCheck");
      });
  };
};

export const logoutHandler = () => {
  return (dispatch) => {
    apiFetch('/auth/logout', {
      method: "GET",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Invalid Credential");
        }
        dispatch(authAction.isLoginHandler({ isLogin: false }));
        localStorage.removeItem("isLogin");
        localStorage.removeItem("loginCheck");
        dispatch(chatAction.replaceChat({ chats: [] }));
        dispatch(chatAction.recentChatHandler({ recentChat: [] }));
        dispatch(chatAction.replacePreviousChat({ previousChat: [] }));
        dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId: "" }));
        dispatch(chatAction.newChatHandler());
        dispatch(
          userAction.setUserData({
            userData: {
              name: "User",
              email: "",
              profileImg: "",
            },
          })
        );
      })
      .catch((err) => {
        console.log(err);
      });
  };
};

export const refreshToken = () => {
  return (dispatch) => {
    apiFetch('/auth/resetToken', {
      method: "GET",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Invalid Credential");
        }
        localStorage.setItem("isLogin", true);
      })
      .catch((err) => {
        console.log(err);
        dispatch(logoutHandler());
      });
  };
};
