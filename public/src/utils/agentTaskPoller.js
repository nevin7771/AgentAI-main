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

  // Function to attempt a single poll
  const attemptPoll = async () => {
    attempts++;
    console.log(
      `Polling attempt ${attempts}/${maxAttempts} for task: ${taskId}`
    );

    try {
      const response = await dispatch(pollAgentResponse(taskId));
      console.log("Poll response:", response);

      if (response && response.status === "complete") {
        console.log(`Task complete after ${attempts} attempts`);
        onComplete(response);
        return response;
      } else if (
        response &&
        (response.status === "pending" || response.status === "in_progress")
      ) {
        onPending(response);

        if (attempts >= maxAttempts) {
          const timeoutError = new Error(
            `Exceeded maximum polling attempts (${maxAttempts})`
          );
          onError(timeoutError);
          throw timeoutError;
        }

        // Schedule next poll
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(attemptPoll());
          }, interval);
        });
      } else {
        const statusError = new Error(
          `Unexpected status: ${response ? response.status : "unknown"}`
        );
        onError(statusError);
        throw statusError;
      }
    } catch (error) {
      console.error(`Error polling task ${taskId}:`, error);

      // Only call onError if we haven't reached max attempts yet
      // This avoids calling onError twice for timeout errors
      if (
        attempts < maxAttempts &&
        error.message !== `Exceeded maximum polling attempts (${maxAttempts})`
      ) {
        onError(error);
      }

      // If we've reached max attempts, stop polling
      if (attempts >= maxAttempts) {
        throw error;
      }

      // Otherwise, retry after a delay
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(attemptPoll());
        }, interval);
      });
    }
  };

  return attemptPoll();
};

export default pollAgentTask;
