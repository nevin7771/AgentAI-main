import { chatAction } from "./chat";
import { userAction } from "./user";

const SERVER_ENDPOINT = process.env.REACT_APP_SERVER_ENDPOINT;
export const openaiApiKey =
  process.env.REACT_APP_OPENAI_API_KEY ||
  "sk-1234567890abcdefghijklmnopqrstuvwxyz";

export const getRecentChat = () => {
  return (dispatch) => {
    dispatch({ type: "GET_RECENT_CHAT_REQUEST" });

    const url = `${SERVER_ENDPOINT}/gemini/api/getchathistory`;

    fetch(url, {
      method: "GET",
      credentials: "include",
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("server error");
        }

        return response.json();
      })
      .then((data) => {
        dispatch({ type: "GET_RECENT_CHAT_SUCCESS" });
        dispatch(
          chatAction.recentChatHandler({ recentChat: data.chatHistory })
        );
        dispatch(userAction.setLocation({ location: data.location }));
      })
      .catch((err) => {
        dispatch({ type: "GET_RECENT_CHAT_FAILURE", error: err });
        console.log(err);
      });
  };
};

export const sendChatData = (useInput) => {
  return (dispatch) => {
    dispatch(chatAction.chatStart({ useInput: useInput }));

    const apiKey = process.env.REACT_APP_GEMINI_KEY;

    const url = `${SERVER_ENDPOINT}/gemini/api/chat`;

    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        userInput: useInput.user,
        previousChat: useInput.previousChat,
        chatHistoryId: useInput.chatHistoryId,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          const statusCode = response.status;
          const error = new Error(`Server Error: ${statusCode}`);
          error.statusCode = statusCode;
          throw error;
        }

        return response.json();
      })
      .then((data) => {
        dispatch(
          chatAction.previousChatHandler({
            previousChat: [
              { role: "user", parts: data.user },
              { role: "model", parts: data.gemini },
            ],
          })
        );
        dispatch(chatAction.popChat());
        dispatch(
          chatAction.chatStart({
            useInput: {
              user: data.user,
              gemini: data.gemini,
              isLoader: "no",
            },
          })
        );
        if (useInput.chatHistoryId.length < 2) {
          dispatch(getRecentChat());
        }
        dispatch(chatAction.newChatHandler());
        dispatch(
          chatAction.chatHistoryIdHandler({ chatHistoryId: data.chatHistoryId })
        );
      })
      .catch((err) => {
        const statusCode = err.statusCode || 500;

        dispatch(chatAction.popChat());
        if (statusCode === 429) {
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: useInput.user,
                gemini:
                  "<span>Rate Limit Exceeded. Please wait for one hour before trying again. Thank you for your patience.</span>",
                isLoader: "no",
              },
            })
          );
        } else {
          dispatch(
            chatAction.chatStart({
              useInput: {
                user: useInput.user,
                gemini:
                  "<span>Oops! Something went wrong on our end. Please refresh the page and try again. If the issue persists, please contact us for assistance.</span>",
                isLoader: "no",
              },
            })
          );
        }
        dispatch(chatAction.newChatHandler());
      });
  };
};

export const sendDeepSearchRequest = (searchRequest) => {
  return (dispatch) => {
    // Create a loading state
    dispatch(
      chatAction.chatStart({
        useInput: {
          user: searchRequest.query,
          gemini: "",
          isLoader: "yes",
        },
      })
    );

    // Define OpenAI API endpoint
    const openaiEndpoint = "https://api.openai.com/v1/chat/completions";

    // Create the search context including the sources
    const sources = searchRequest.sources.join(", ");
    const searchContext = `
      I want you to perform a deep web search query on the following sources: ${sources}.
      Search for information related to: "${searchRequest.query}"
      Format your response as HTML with links to relevant resources.
      Include a summary section at the end.
    `;

    // For development, we'll simulate the API call
    // In production, replace this with an actual fetch to OpenAI API
    console.log("Would send to OpenAI API:", {
      endpoint: openaiEndpoint,
      model: "gpt-4",
      prompt: searchContext,
    });

    // Simulate API call with delay
    setTimeout(() => {
      dispatch(chatAction.popChat());

      // Build a well-formatted response with sources
      const response = `
        <div class="deep-search-results">
          <h3>Deep Research Results</h3>
          <p>Query: "${searchRequest.query}"</p>
          <p>Sources searched: ${sources}</p>
          
          <h4>Top Results</h4>
          <ul>
            <li>
              <a href="https://support.zoom.us/hc/en-us/articles/201362003-Zoom-Technical-Support" target="_blank">
                Zoom Technical Support
              </a>
              <p>Get help from Zoom support through various channels including chat, phone, and ticket submission.</p>
            </li>
            <li>
              <a href="https://community.zoom.us/search?query=${encodeURIComponent(
                searchRequest.query
              )}" target="_blank">
                Community Discussions
              </a>
              <p>Similar questions from other Zoom users with solutions and workarounds.</p>
            </li>
            <li>
              <a href="https://zoom.us/docs" target="_blank">
                Zoom Documentation
              </a>
              <p>Official guides and resources for using Zoom services and features.</p>
            </li>
          </ul>
          
          <h4>Summary</h4>
          <p>Based on your search query "${
            searchRequest.query
          }", I found several relevant resources across Zoom's official channels. The most authoritative information comes from Zoom's support documentation, while community forums provide practical user experiences. For direct assistance, Zoom Technical Support offers multiple contact options including live chat and phone support.</p>
        </div>
      `;

      // Add the response to the chat
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: searchRequest.query,
            gemini: response,
            isLoader: "no",
            isDeepSearch: true,
          },
        })
      );

      // Ensure the UI is updated to reflect the new chat
      dispatch(chatAction.newChatHandler());
    }, 2000);

    /* 
    // In production, replace the above simulation with this actual API call:
    
    fetch(openaiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a research assistant that searches the web and provides well-structured, informative responses with links to sources.'
          },
          {
            role: 'user',
            content: searchContext
          }
        ],
        temperature: 0.7
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      dispatch(chatAction.popChat());
      
      const aiResponse = data.choices[0].message.content;
      
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: searchRequest.query,
            gemini: aiResponse,
            isLoader: "no",
            isDeepSearch: true,
          },
        })
      );
      
      dispatch(chatAction.newChatHandler());
    })
    .catch(error => {
      console.error('OpenAI API error:', error);
      dispatch(chatAction.popChat());
      
      dispatch(
        chatAction.chatStart({
          useInput: {
            user: searchRequest.query,
            gemini: '<span>Sorry, there was an error processing your deep search request. Please try again later.</span>',
            isLoader: "no",
          },
        })
      );
      
      dispatch(chatAction.newChatHandler());
    });
    */
  };
};

export const getChat = (chatHistoryId) => {
  return (dispatch) => {
    dispatch(chatAction.loaderHandler());
    const url = `${SERVER_ENDPOINT}/gemini/api/chatdata`;

    fetch(url, {
      method: "POST",
      body: JSON.stringify({ chatHistoryId }),
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("server error");
        }
        return response.json();
      })
      .then((data) => {
        dispatch(chatAction.loaderHandler());
        const previousChat = data.chats.flatMap((c) => [
          { role: "user", parts: c.message.user },
          { role: "model", parts: c.message.gemini },
        ]);

        const chats = data.chats.map((c) => {
          return {
            user: c.message.user,
            gemini: c.message.gemini,
            id: c._id,
            isLoader: "no",
          };
        });

        const chatHistoryId = data.chatHistory;

        dispatch(chatAction.replacePreviousChat({ previousChat }));
        dispatch(chatAction.replaceChat({ chats }));
        dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId }));
        dispatch(chatAction.newChatHandler());
      })
      .catch((err) => {
        console.log(err);
        dispatch(
          chatAction.replaceChat({
            chats: [
              {
                error: true,
                user: "Hi, is there any issue ? ",
                gemini: "",
                id: 34356556565,
                isLoader: "Oops! I couldn't find your chat history",
              },
            ],
          })
        );
        dispatch(chatAction.loaderHandler());
        dispatch(chatAction.chatHistoryIdHandler({ chatHistoryId }));
      });
  };
};
