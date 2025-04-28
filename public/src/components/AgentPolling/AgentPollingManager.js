// public/src/components/AgentPolling/AgentPollingManager.js
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { chatAction } from '../../store/chat';
import { agentAction } from '../../store/agent';
import { SERVER_ENDPOINT } from '../../store/agent-actions';
import proxyAgentPoll from '../../utils/proxyAgentPoller';

/**
 * Manages polling of agent tasks directly to external APIs
 * This component doesn't render anything but manages polling in the background
 */
const AgentPollingManager = ({ agentId, taskId, endpoint, token, onComplete }) => {
  const dispatch = useDispatch();
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // Skip if missing required params
    if (!agentId || !taskId || !endpoint || !token) {
      console.log('Missing required parameters for agent polling');
      return;
    }
    
    let isMounted = true;
    
    const startPolling = async () => {
      if (isPolling) return;
      
      setIsPolling(true);
      console.log(`Starting agent polling for ${agentId} with taskId ${taskId}`);
      
      try {
        await proxyAgentPoll(
          {
            agentId,
            taskId,
            maxAttempts: 30,
            interval: 2000,
          },
          // On Complete
          (data) => {
            if (!isMounted) return;
            
            console.log(`Agent ${agentId} task complete:`, data);
            
            // Validate that we have the result data
            if (!data.result) {
              console.error(`Agent ${agentId} response missing result data:`, data);
              onError(new Error(`Missing result data from agent ${agentId}`));
              return;
            }
            
            // Format the result for display
            console.log(`Formatting result for agent ${agentId}. Result:`, data.result);
            
            // Ensure result is a string and format Markdown
            let resultText = typeof data.result === 'object' 
              ? JSON.stringify(data.result)
              : String(data.result);
              
            // Attempt to format Markdown in the text
            try {
              // Replace Markdown headers with HTML headers
              resultText = resultText.replace(/##\s+([^\n]+)/g, '<h2>$1</h2>');
              
              // Replace Markdown list items with HTML list items
              resultText = resultText.replace(/^\s*-\s+([^\n]+)/gm, '<li>$1</li>');
              
              // Wrap list items in unordered lists
              if (resultText.includes('<li>')) {
                resultText = resultText.replace(/(<li>.*?<\/li>)\s*\n\s*(?!<li>)/gs, '$1</ul>\n');
                resultText = resultText.replace(/(?<!<\/ul>)\s*\n\s*(<li>)/gs, '\n<ul>$1');
                
                // Close any remaining unclosed lists
                if ((resultText.match(/<ul>/g) || []).length > (resultText.match(/<\/ul>/g) || []).length) {
                  resultText += '</ul>';
                }
              }
              
              // Convert Markdown line breaks to HTML breaks
              resultText = resultText.replace(/\n\n/g, '<br><br>');
            } catch (e) {
              console.error('Error formatting Markdown:', e);
              // Fall back to simple string
            }
            
            console.log('Final formatted HTML result:', resultText);
            
            const formattedResult = `
              <div class="simple-search-results">
                <h3>Agent Response (${agentId})</h3>
                
                <div class="simple-search-content">
                  <div class="agent-result">
                    <h2>## Answer</h2>
                    <div class="agent-answer">
                      ${resultText}
                    </div>
                  </div>
                </div>
                
                <div class="search-key-points">
                  <h4>## Key Points</h4>
                  <ul>
                    <li>This response came directly from the ${agentId} agent</li>
                    <li>Responses processed directly from the agent API</li>
                    <li>For more perspectives, try selecting multiple agents</li>
                  </ul>
                </div>
                
                <div class="search-related-section">
                  <h4>## Next Steps</h4>
                  <p>You can try:</p>
                  <ul>
                    <li>Asking a more specific question</li>
                    <li>Including more details in your query</li>
                    <li>Selecting different agents for other perspectives</li>
                  </ul>
                </div>
                
                <div class="search-follow-up">
                  <h4>## Follow-up Questions</h4>
                  <div class="gemini-chips-container">
                    <div class="gemini-chips">
                      <button class="gemini-chip" onclick="document.querySelector('.input-field').value='Tell me more about this'; setTimeout(() => document.querySelector('.send-btn').click(), 100);">
                        <span class="gemini-chip-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" 
                              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </span>
                        <span class="gemini-chip-text">Tell me more about this</span>
                      </button>
                      <button class="gemini-chip" onclick="document.querySelector('.input-field').value='How can I troubleshoot this?'; setTimeout(() => document.querySelector('.send-btn').click(), 100);">
                        <span class="gemini-chip-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" 
                              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                        </span>
                        <span class="gemini-chip-text">How can I troubleshoot this?</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            `;
            
            // Update chat with result
            dispatch(chatAction.popChat()); // Remove loading message
            dispatch(
              chatAction.chatStart({
                useInput: {
                  user: data.question || "Agent query",
                  gemini: formattedResult,
                  isLoader: "no",
                  isSearch: true,
                  searchType: "agent", // Use agent format for clarity
                },
              })
            );
            
            // Create a random ID for the chat
            const randomId = `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            
            // Set chat history ID
            dispatch(
              chatAction.chatHistoryIdHandler({
                chatHistoryId: randomId,
              })
            );
            
            // Create the chat history on the server (without using await directly)
            fetch(`${SERVER_ENDPOINT}/api/create-chat-history`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                title: data.question || 'Agent response',
                message: {
                  user: data.question || 'Agent query',
                  gemini: formattedResult,
                },
                isSearch: true,
                searchType: 'agent'
              })
            })
            .then(response => {
              if (response.ok) {
                return response.json();
              } else {
                console.error('Error creating chat history:', response.statusText);
                throw new Error(response.statusText);
              }
            })
            .then(result => {
              if (result.success && result.chatHistoryId) {
                // Update chat history ID with the one from the server
                dispatch(
                  chatAction.chatHistoryIdHandler({
                    chatHistoryId: result.chatHistoryId,
                  })
                );
                
                // Navigate to the chat page with the new history ID
                window.location.href = `/app/${result.chatHistoryId}`;
              } else {
                // Fallback - use the random ID we created
                window.location.href = `/app/${randomId}`;
              }
            })
            .catch(error => {
              console.error('Error creating chat history:', error);
              // Fallback - use the random ID we created
              window.location.href = `/app/${randomId}`;
            });
            
            // Clear active task
            dispatch(agentAction.clearActiveTask());
            
            // Call onComplete callback
            if (onComplete) onComplete(data);
            
            setIsPolling(false);
          },
          // On Pending
          (data) => {
            if (!isMounted) return;
            console.log(`Agent ${agentId} task still pending:`, data);
          },
          // On Error
          (error) => {
            if (!isMounted) return;
            console.error(`Agent ${agentId} polling error:`, error);
            setError(error.message || 'Unknown error');
            setIsPolling(false);
          }
        );
      } catch (error) {
        if (!isMounted) return;
        console.error(`Agent polling failed:`, error);
        setError(error.message || 'Unknown error');
        setIsPolling(false);
      }
    };
    
    startPolling();
    
    return () => {
      isMounted = false;
    };
  }, [agentId, taskId, endpoint, token, dispatch, onComplete, isPolling]);
  
  return null; // This component doesn't render anything
};

export default AgentPollingManager;