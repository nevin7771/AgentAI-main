// Updated App.js - Light Theme Only, No Settings Section
import "./App.css";
import "./DeepSearch.css";
import "./DeepResearch.css";
import "./AgentStyles.css";
import "../../public/src/styles/GeminiResults.css";
import ChatSection from "./components/ChatSection/ChatSection";
import Sidebar from "./components/Sidebar/Sidebar";
import { useSelector, useDispatch } from "react-redux";
import { useEffect, useState } from "react";
import { getRecentChat } from "./store/chat-action";
import UserDetails from "./components/UserDetails/UserDetails";
import { refreshToken, loginHandler } from "./store/auth-action";
import UserIntroPrompt from "./components/UserIntroPrompt/UserIntroPrompt";
import AgentProvider from "./components/AgentChat/AgentProvider";
import { continueWithOktaOauth } from "./utils/getOktaAuthUrl";
import { uiAction } from "./store/ui-gemini";

// Loading spinner component for authentication check
const AuthLoadingSpinner = ({ message = "Checking authentication..." }) => (
  <div
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "#ffffff",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
    }}>
    <div
      style={{
        width: "60px",
        height: "60px",
        border: "4px solid #e3f2fd",
        borderTop: "4px solid #1976d2",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
        marginBottom: "24px",
      }}
    />
    <h3
      style={{
        color: "#1976d2",
        margin: "0 0 8px 0",
        fontSize: "18px",
        fontWeight: "500",
      }}>
      Authenticating...
    </h3>
    <p
      style={{
        color: "#5f6368",
        margin: "0",
        fontSize: "14px",
      }}>
      {message}
    </p>
    <style>
      {`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}
    </style>
  </div>
);

// Clean login screen
const UnauthorizedAccess = ({ onLoginClick }) => (
  <div
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "#f8f9fa",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
      padding: "24px",
    }}>
    <div
      style={{
        maxWidth: "400px",
        textAlign: "center",
        backgroundColor: "white",
        padding: "32px",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        border: "1px solid #e8eaed",
      }}>
      <div
        style={{
          width: "64px",
          height: "64px",
          backgroundColor: "#e3f2fd",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px auto",
        }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="#1976d2">
          <path d="M18,8A6,6 0 0,0 12,2A6,6 0 0,0 6,8H4V20H20V8H18M12,4A4,4 0 0,1 16,8H8A4,4 0 0,1 12,4M12,17A2,2 0 0,1 10,15A2,2 0 0,1 12,13A2,2 0 0,1 14,15A2,2 0 0,1 12,17Z" />
        </svg>
      </div>

      <h2
        style={{
          color: "#202124",
          margin: "0 0 16px 0",
          fontSize: "24px",
          fontWeight: "500",
        }}>
        VISTA - AI Agent
      </h2>

      <p
        style={{
          color: "#5f6368",
          margin: "0 0 24px 0",
          fontSize: "16px",
          lineHeight: "1.5",
        }}>
        You need to sign in with your Okta account Please contact
        naveen.kumarv@zoom.us
      </p>

      <button
        onClick={onLoginClick}
        style={{
          backgroundColor: "#1976d2",
          color: "white",
          border: "none",
          borderRadius: "8px",
          padding: "12px 24px",
          fontSize: "16px",
          fontWeight: "500",
          cursor: "pointer",
          transition: "all 0.2s ease",
          fontFamily: "'Google Sans', Roboto, Arial, sans-serif",
          minWidth: "180px",
        }}
        onMouseOver={(e) => {
          e.target.style.backgroundColor = "#1565c0";
          e.target.style.transform = "translateY(-1px)";
          e.target.style.boxShadow = "0 4px 8px rgba(25, 118, 210, 0.3)";
        }}
        onMouseOut={(e) => {
          e.target.style.backgroundColor = "#1976d2";
          e.target.style.transform = "translateY(0)";
          e.target.style.boxShadow = "none";
        }}>
        Sign In with Okta
      </button>

      <p
        style={{
          color: "#9aa0a6",
          margin: "16px 0 0 0",
          fontSize: "14px",
        }}></p>
    </div>
  </div>
);

function App() {
  const dispatch = useDispatch();
  const newChat = useSelector((state) => state.chat.newChat);
  const isUserDetails = useSelector((state) => state.ui.isUserDetailsShow);
  const isLogin = useSelector((state) => state.auth.isLogin);
  const isIntroPrompt = useSelector((state) => state.ui.showIntroUserPrompt);

  // Authentication state management
  const [authState, setAuthState] = useState({
    isChecking: true,
    isAuthenticated: false,
    hasChecked: false,
    loadingMessage: "Checking authentication...",
  });

  // ENHANCED: Automatic SSO check using Okta silent authentication
  const performAutomaticSSOCheck = async () => {
    console.log("🔍 Performing automatic SSO check...");

    try {
      // Check if we have environment variables for Okta
      const oktaClientId = process.env.REACT_APP_OKTA_CLIENT_ID;
      const oktaIssuer = process.env.REACT_APP_OKTA_ISSUER;

      if (!oktaClientId || !oktaIssuer) {
        console.log(
          "⚠️ Okta environment variables not configured, skipping SSO check"
        );
        return false;
      }

      setAuthState((prev) => ({
        ...prev,
        loadingMessage: "Checking for existing Okta session...",
      }));

      // Create a promise-based approach for iframe SSO check
      const ssoCheckPromise = new Promise((resolve) => {
        // Generate silent auth URL
        const silentAuthUrl = new URL(`${oktaIssuer}/v1/authorize`);
        silentAuthUrl.searchParams.append("client_id", oktaClientId);
        silentAuthUrl.searchParams.append("response_type", "code");
        silentAuthUrl.searchParams.append("scope", "openid profile email");
        silentAuthUrl.searchParams.append(
          "redirect_uri",
          window.location.origin + "/sso-callback"
        );
        silentAuthUrl.searchParams.append("prompt", "none"); // Silent authentication
        silentAuthUrl.searchParams.append("state", "auto-sso-check");

        // Create hidden iframe for silent check
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        iframe.style.width = "0";
        iframe.style.height = "0";
        iframe.src = silentAuthUrl.toString();

        let resolved = false;

        // Timeout after 3 seconds
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            console.log("⏱️ SSO check timeout - assuming no existing session");
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
            resolve(false);
          }
        }, 3000);

        // Handle iframe load
        iframe.onload = () => {
          setTimeout(() => {
            if (!resolved) {
              try {
                // Try to access iframe content
                const iframeUrl = iframe.contentWindow.location.href;

                console.log("🔗 SSO iframe loaded, checking URL...");

                if (iframeUrl.includes("code=")) {
                  resolved = true;
                  clearTimeout(timeout);
                  console.log("✅ Found existing Okta session! Redirecting...");

                  // Extract auth code and redirect to backend
                  const urlParams = new URLSearchParams(
                    new URL(iframeUrl).search
                  );
                  const code = urlParams.get("code");

                  if (iframe.parentNode) {
                    document.body.removeChild(iframe);
                  }

                  // Redirect to your backend callback
                  window.location.href = `/api/auth/okta/callback?code=${code}&state=auto-sso`;
                  resolve(true);
                } else if (iframeUrl.includes("error=")) {
                  resolved = true;
                  clearTimeout(timeout);
                  console.log(
                    "❌ SSO check returned error - no existing session"
                  );

                  if (iframe.parentNode) {
                    document.body.removeChild(iframe);
                  }
                  resolve(false);
                } else {
                  // Still loading or unknown state, wait a bit more
                  setTimeout(() => {
                    if (!resolved) {
                      resolved = true;
                      clearTimeout(timeout);
                      console.log(
                        "🤷 SSO check inconclusive - assuming no session"
                      );

                      if (iframe.parentNode) {
                        document.body.removeChild(iframe);
                      }
                      resolve(false);
                    }
                  }, 1000);
                }
              } catch (error) {
                // Cross-origin access blocked (expected)
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  console.log(
                    "🔒 Cross-origin access blocked - checking for redirect..."
                  );

                  // Check if we were redirected (indicates successful SSO)
                  setTimeout(() => {
                    if (window.location.search.includes("code=")) {
                      console.log("✅ Detected successful SSO redirect!");
                      resolve(true);
                    } else {
                      console.log("❌ No SSO session found");
                      if (iframe.parentNode) {
                        document.body.removeChild(iframe);
                      }
                      resolve(false);
                    }
                  }, 500);
                }
              }
            }
          }, 100);
        };

        // Handle iframe error
        iframe.onerror = () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            console.log("❌ SSO iframe error - no existing session");
            if (iframe.parentNode) {
              document.body.removeChild(iframe);
            }
            resolve(false);
          }
        };

        // Add iframe to DOM
        document.body.appendChild(iframe);
      });

      const ssoResult = await ssoCheckPromise;
      return ssoResult;
    } catch (error) {
      console.error("🚨 Automatic SSO check failed:", error);
      return false;
    }
  };

  // CRITICAL: Enhanced authentication check with automatic SSO
  useEffect(() => {
    const performCompleteAuthCheck = async () => {
      console.log("🔐 Starting complete authentication check...");

      try {
        // Step 1: Check if we're returning from Okta callback
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");

        if (code) {
          console.log("🔗 Okta callback detected, processing...");
          setAuthState((prev) => ({
            ...prev,
            loadingMessage: "Processing Okta callback...",
          }));

          // Let your backend handle the Okta callback
          window.location.href = `/api/auth/okta/callback${window.location.search}`;
          return;
        }

        // Step 2: Try existing session check first
        console.log("🔍 Checking existing session...");
        setAuthState((prev) => ({
          ...prev,
          loadingMessage: "Checking existing session...",
        }));

        dispatch(loginHandler());

        // Wait a moment for the loginHandler to complete
        setTimeout(async () => {
          // Step 3: If not authenticated, try automatic SSO
          const currentLoginState = localStorage.getItem("isLogin");

          if (!currentLoginState || currentLoginState !== "true") {
            console.log(
              "📱 No existing session found, trying automatic SSO..."
            );

            const ssoSuccess = await performAutomaticSSOCheck();

            if (!ssoSuccess) {
              console.log("❌ No SSO session found, showing login screen");
              setAuthState({
                isChecking: false,
                isAuthenticated: false,
                hasChecked: true,
                loadingMessage: "",
              });
            }
            // If ssoSuccess is true, we're redirecting to callback
          } else {
            console.log("✅ Existing session found");
            setAuthState({
              isChecking: false,
              isAuthenticated: true,
              hasChecked: true,
              loadingMessage: "",
            });
          }
        }, 1000);
      } catch (error) {
        console.error("🚨 Authentication check failed:", error);
        setAuthState({
          isChecking: false,
          isAuthenticated: false,
          hasChecked: true,
          loadingMessage: "",
        });
      }
    };

    performCompleteAuthCheck();
  }, [dispatch]);

  // Handle manual Okta login redirect
  const handleOktaLogin = () => {
    console.log("🔄 Initiating manual Okta login...");

    try {
      const oktaAuthUrl = continueWithOktaOauth();
      console.log("🔗 Generated Okta URL:", oktaAuthUrl);

      // Redirect to Okta
      window.location.href = oktaAuthUrl;
    } catch (error) {
      console.error("🚨 Error generating Okta URL:", error);
      alert("Failed to redirect to login. Please check your configuration.");
    }
  };

  // Update auth state when Redux login state changes
  useEffect(() => {
    if (isLogin && !authState.isAuthenticated && authState.hasChecked) {
      console.log("✅ Redux login state updated - user is authenticated");
      setAuthState((prev) => ({
        ...prev,
        isAuthenticated: true,
        isChecking: false,
      }));
    } else if (!isLogin && authState.isAuthenticated && authState.hasChecked) {
      console.log(
        "❌ Redux login state updated - user is no longer authenticated"
      );
      setAuthState((prev) => ({
        ...prev,
        isAuthenticated: false,
        isChecking: false,
      }));
    }
  }, [isLogin, authState.isAuthenticated, authState.hasChecked]);

  // Determine authentication status based on Redux state after check is complete
  useEffect(() => {
    if (authState.hasChecked && !authState.isChecking) {
      setAuthState((prev) => ({
        ...prev,
        isAuthenticated: isLogin,
      }));
    }
  }, [authState.hasChecked, authState.isChecking, isLogin]);

  // Apply light theme only
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
  }, []);

  // Load recent chat only when authenticated
  useEffect(() => {
    if (authState.isAuthenticated && newChat === false) {
      dispatch(getRecentChat());
    }
  }, [dispatch, newChat, authState.isAuthenticated]);

  // Refresh token management only when authenticated
  useEffect(() => {
    if (!authState.isAuthenticated) return;

    const refreshTokenHandler = setInterval(() => {
      if (authState.isAuthenticated) {
        console.log("🔄 Auto-refreshing token...");
        dispatch(refreshToken());
      }
    }, 14 * 60 * 1000); // 14 minutes

    return () => clearInterval(refreshTokenHandler);
  }, [dispatch, authState.isAuthenticated]);

  // User intro prompt only when authenticated
  useEffect(() => {
    if (!authState.isAuthenticated) return;

    const timer = setTimeout(() => {
      const isShowIntroAlready = localStorage.getItem("isIntroShow");
      if (!isShowIntroAlready) {
        dispatch(uiAction.userIntroPromptHandler({ introPrompt: true }));
        localStorage.setItem("isIntroShow", "true");
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [dispatch, authState.isAuthenticated]);

  // Show loading spinner while checking authentication
  if (authState.isChecking) {
    return <AuthLoadingSpinner message={authState.loadingMessage} />;
  }

  // Show login screen if not authenticated
  if (!authState.isAuthenticated) {
    return <UnauthorizedAccess onLoginClick={handleOktaLogin} />;
  }

  // Render the authenticated app
  console.log("✅ Rendering authenticated app");

  return (
    <div className="App">
      <AgentProvider>
        <Sidebar />
        <ChatSection />
        {isUserDetails && isLogin && <UserDetails />}
        {!isLogin && isIntroPrompt && <UserIntroPrompt />}
      </AgentProvider>
    </div>
  );
}

export default App;
