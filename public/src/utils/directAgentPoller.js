// public/src/utils/directAgentPoller.js
import axios from 'axios';

/**
 * Polls directly for agent task status at the agent API endpoints
 * This bypasses our server to check status directly with the external agent API
 * 
 * @param {Object} taskConfig - Configuration for the task
 * @param {Function} onComplete - Callback when complete
 * @param {Function} onPending - Callback when pending
 * @param {Function} onError - Callback when error
 * @returns {Promise} A promise that resolves when polling is complete
 */
const directAgentPoll = async (taskConfig, onComplete, onPending, onError) => {
  const {
    agentId,
    taskId,
    endpoint,
    token,
    maxAttempts = 30,
    interval = 2000,
  } = taskConfig;

  // Log start of polling
  console.log(`Starting direct poll for agent ${agentId} at ${endpoint} with taskId: ${taskId}`);
  
  let attempts = 0;
  let finalEndpoint;
  
  // Construct the correct endpoint URL with taskId
  if (endpoint.includes('?')) {
    // Add taskId as an additional parameter
    finalEndpoint = `${endpoint}&taskId=${taskId}`;
  } else {
    // Add taskId as the first parameter
    finalEndpoint = `${endpoint}?taskId=${taskId}`;
  }
  
  console.log(`Polling URL: ${finalEndpoint}`);

  // Function to attempt a single poll
  const attemptPoll = async () => {
    attempts++;
    console.log(`Polling attempt ${attempts}/${maxAttempts} for agent ${agentId}`);

    try {
      // Make request directly to the agent API
      const response = await axios.get(finalEndpoint, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log(`Poll response from ${agentId}:`, response.data);
      
      // Check the status (status 1 = pending, 2,3,4 = complete)
      const status = response.data.body?.status;
      
      if (status === 2 || status === 3 || status === 4) {
        // Complete - extract result
        const result = response.data.body?.result;
        if (result) {
          console.log(`Task complete for agent ${agentId} after ${attempts} attempts`);
          onComplete({
            agentId,
            taskId,
            result,
            rawResponse: response.data
          });
          return true;
        } else {
          // No result found but status is complete
          throw new Error(`No result found in response from ${agentId} despite complete status`);
        }
      } else if (status === 1) {
        // Still pending
        onPending({
          agentId,
          taskId,
          attempts,
          rawResponse: response.data
        });
        
        if (attempts >= maxAttempts) {
          throw new Error(`Exceeded maximum polling attempts (${maxAttempts})`);
        }

        // Schedule next poll
        await new Promise(resolve => setTimeout(resolve, interval));
        return attemptPoll();
      } else {
        // Unknown status
        throw new Error(`Unexpected status ${status} from ${agentId}`);
      }
    } catch (error) {
      console.error(`Error polling agent ${agentId}:`, error);
      onError(error);
      
      if (attempts >= maxAttempts) {
        throw new Error(`Exceeded maximum polling attempts (${maxAttempts})`);
      }
      
      // Retry after delay
      await new Promise(resolve => setTimeout(resolve, interval));
      return attemptPoll();
    }
  };

  return attemptPoll();
};

export default directAgentPoll;