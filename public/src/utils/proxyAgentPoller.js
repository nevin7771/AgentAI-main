// public/src/utils/proxyAgentPoller.js
/**
 * Polls for agent task status via our backend proxy instead of directly
 * This avoids CORS issues when accessing external agent APIs
 *
 * @param {Object} taskConfig - Configuration for the task
 * @param {Function} onComplete - Callback when complete
 * @param {Function} onPending - Callback when pending
 * @param {Function} onError - Callback when error
 * @returns {Promise} A promise that resolves when polling is complete
 */
const proxyAgentPoll = async (taskConfig, onComplete, onPending, onError) => {
  const { agentId, taskId, maxAttempts = 30, interval = 2000 } = taskConfig;

  // Log start of polling
  console.log(
    `Starting proxy poll for agent ${agentId} with taskId: ${taskId}`
  );

  let attempts = 0;

  // Function to attempt a single poll
  const attemptPoll = async () => {
    attempts++;
    console.log(
      `Proxy polling attempt ${attempts}/${maxAttempts} for agent ${agentId}`
    );

    try {
      // Make request through our backend proxy
      const response = await fetch(`/api/proxy-agent-poll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          agentId,
          taskId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Error polling agent: HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`Proxy poll response for ${agentId}:`, data);

      // Add default question value if missing
      if (!data.question) {
        data.question = "Agent query";
      }

      if (data.status === "complete" || data.status === "success") {
        // Complete - extract result
        if (data.result !== undefined) {
          console.log(
            `Task complete for agent ${agentId} after ${attempts} attempts`
          );

          // Ensure result is a string if it's an object
          let finalResult = data.result;
          if (typeof finalResult === "object") {
            console.log(
              `Converting object result to string for agent ${agentId}`
            );
            try {
              finalResult = finalResult.answer || JSON.stringify(finalResult);
            } catch (e) {
              console.error(`Error stringifying result:`, e);
              finalResult = String(finalResult);
            }
          }

          // Call the onComplete callback with a clone of the data to prevent mutations
          onComplete({
            ...data,
            agentId,
            taskId,
            result: finalResult,
            question: data.question || "",
            rawResponse: data,
            status: "complete", // Ensure status is explicit
          });

          return true;
        } else {
          // No result found but status is complete
          console.log(`No result in response despite complete status`);

          // Still call onComplete but with empty result
          onComplete({
            agentId,
            taskId,
            result: "The agent didn't provide a response",
            question: data.question || "",
            rawResponse: data,
            status: "complete",
          });

          return true;
        }
      } else if (data.status === "pending" || data.status === "in_progress") {
        // Still pending
        onPending({
          agentId,
          taskId,
          attempts,
          rawResponse: data,
        });

        if (attempts >= maxAttempts) {
          console.log(
            `Maximum ${maxAttempts} attempts reached for task ${taskId}`
          );

          // Call onComplete with timeout message
          onComplete({
            agentId,
            taskId,
            result: "The agent took too long to respond",
            question: data.question || "",
            rawResponse: data,
            status: "timeout",
          });

          return true;
        }

        // Schedule next poll
        await new Promise((resolve) => setTimeout(resolve, interval));
        return attemptPoll();
      } else {
        // Unknown status - we'll treat this as complete but with a message
        console.log(`Unexpected status ${data.status} from ${agentId}`);

        // Still call onComplete with status message
        onComplete({
          agentId,
          taskId,
          result: `Received unexpected status: ${data.status}`,
          question: data.question || "",
          rawResponse: data,
          status: "error",
        });

        return true;
      }
    } catch (error) {
      console.error(`Error in proxy polling for agent ${agentId}:`, error);

      if (attempts >= maxAttempts) {
        console.log(`Maximum ${maxAttempts} attempts reached due to errors`);

        // Call onError to report the problem
        onError(error);

        // But also call onComplete to ensure UI is updated
        onComplete({
          agentId,
          taskId,
          result: `Error polling agent: ${error.message}`,
          question: "Agent query",
          status: "error",
        });

        return true;
      }

      // Retry after delay
      await new Promise((resolve) => setTimeout(resolve, interval));
      return attemptPoll();
    }
  };

  return attemptPoll();
};

export default proxyAgentPoll;
