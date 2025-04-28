// public/src/utils/agentTaskPoller.js
import { pollAgentResponse } from "../store/agent-actions";

/**
 * Polls for agent task status at regular intervals
 * @param {string} taskId - The task ID to poll for
 * @param {Function} dispatch - Redux dispatch function
 * @param {Object} options - Polling options
 * @returns {Promise} A promise that resolves when polling is complete
 */
const pollAgentTask = async (taskId, dispatch, options = {}) => {
  const {
    maxAttempts = 30, // Default to 30 attempts
    interval = 2000, // Default to 2 seconds
    onComplete = () => {}, // Callback when complete
    onPending = () => {}, // Callback when pending
    onError = () => {}, // Callback when error
  } = options;

  console.log(`Starting to poll agent task: ${taskId}`);
  let attempts = 0;
  let lastError = null;
  const maxConsecutiveErrors = 3;
  let consecutiveErrors = 0;

  // Function to attempt a single poll
  const attemptPoll = async () => {
    attempts++;
    console.log(`Polling attempt ${attempts}/${maxAttempts} for task: ${taskId}`);

    try {
      const response = await dispatch(pollAgentResponse(taskId));
      
      // Reset consecutive errors on successful response
      consecutiveErrors = 0;

      if (response.status === "complete") {
        console.log(`Task complete after ${attempts} attempts`);
        onComplete(response);
        return response;
      } else if (response.status === "pending") {
        onPending(response);
        
        if (attempts >= maxAttempts) {
          throw new Error(`Exceeded maximum polling attempts (${maxAttempts})`);
        }

        // Schedule next poll
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(attemptPoll());
          }, interval);
        });
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error polling task ${taskId} (attempt ${attempts}/${maxAttempts}):`, error);
      
      // Track consecutive errors
      consecutiveErrors++;
      lastError = error;

      if (consecutiveErrors >= maxConsecutiveErrors) {
        // Too many consecutive errors, abort polling
        console.error(`Aborting agent task polling after ${consecutiveErrors} consecutive errors`);
        onError(error);
        throw error;
      }
      
      if (attempts >= maxAttempts) {
        // Maximum attempts reached
        console.error(`Exceeded maximum polling attempts (${maxAttempts})`);
        onError(error);
        throw error;
      }

      // Schedule next poll with exponential backoff
      const backoff = Math.min(interval * Math.pow(1.5, consecutiveErrors - 1), 10000);
      console.log(`Retrying in ${backoff}ms after error...`);
      
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(attemptPoll());
        }, backoff);
      });
    }
  };

  return attemptPoll();
};

export default pollAgentTask;