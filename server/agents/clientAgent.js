import LogParserAgent from "./logParserAgent.js"; // Changed to ESM import and added .js
// import AIStudioAgent from "./aiStudioAgent.js"; // Assuming this will be created/adapted
// import DirectJiraAgent from "./directJiraAgent.js"; // Assuming this will be created/adapted
// import DirectConfluenceAgent from "./directConfluenceAgent.js"; // Assuming this will be created/adapted

class ClientAgent {
  constructor(sessionId, userId) {
    this.sessionId = sessionId;
    this.userId = userId;
    this.state = {
      initialProblem: null,
      gatheredInfo: {},
      uploadedLogPath: null,
      identifiedErrorCodeFromLog: null,
      identifiedTrackingIdFromLog: null,
      aiStudioAgentHistory: [],
      directApiCallHistory: [],
      logParserFindings: null,
      currentConversationTopic: null,
      conversationHistory: [], // { turn: "user"/"agent", message: "...", timestamp: ... }
    };
    this.logParser = new LogParserAgent();
    // this.aiStudioAgent = new AIStudioAgent();
    // this.directJiraAgent = new DirectJiraAgent();
    // this.directConfluenceAgent = new DirectConfluenceAgent();

    console.log(
      `ClientAgent initialized for session: ${sessionId}, user: ${userId}`
    );
  }

  async handleMessage(userInput) {
    this.state.conversationHistory.push({
      turn: "user",
      message: userInput,
      timestamp: new Date(),
    });
    let agentResponse = "";

    // 1. Intent Recognition (Simple keyword-based for prototype)
    const lowerInput = userInput.toLowerCase();

    if (
      lowerInput.includes("upload log") ||
      lowerInput.includes("analyze my log")
    ) {
      if (this.state.uploadedLogPath) {
        agentResponse = await this.processLogAnalysis(
          this.state.uploadedLogPath
        );
      } else if (lowerInput.startsWith("log uploaded:")) {
        const filePath = userInput.substring("log uploaded:".length).trim();
        this.state.uploadedLogPath = filePath; // Store it
        this.state.gatheredInfo.uploadedLogPath = filePath;
        agentResponse = await this.processLogAnalysis(filePath);
      } else {
        agentResponse =
          "Please upload your log file first. You can use the upload button.";
      }
    } else if (
      lowerInput.includes("help") ||
      lowerInput.includes("issue") ||
      lowerInput.includes("problem")
    ) {
      if (!this.state.initialProblem) {
        this.state.initialProblem = userInput;
      }
      agentResponse =
        "I understand you have an issue. Can you describe it in more detail or provide an error message?";
      // TODO: Integrate with AIStudioAgent for what2collect
    } else if (
      this.state.uploadedLogPath &&
      lowerInput.includes("error code")
    ) {
      if (this.state.identifiedErrorCodeFromLog) {
        agentResponse = `Looking up information for error code: ${this.state.identifiedErrorCodeFromLog}.`;
        // TODO: Query AIStudioAgent (errorcode datasource)
      } else {
        agentResponse =
          'I haven"t identified a specific error code from the log yet.';
      }
    } else {
      agentResponse = `I received your message: "${userInput}". How can I assist you further with troubleshooting or log analysis?`;
      // TODO: Integrate with AIStudioAgent for general Q&A
    }

    this.state.conversationHistory.push({
      turn: "agent",
      message: agentResponse,
      timestamp: new Date(),
    });
    return {
      response: agentResponse,
      sessionId: this.sessionId,
      // suggestedFollowUps: this.generateFollowUps(agentResponse) // TODO
    };
  }

  async processLogAnalysis(logFilePath) {
    if (!logFilePath) {
      return "No log file path provided for analysis.";
    }
    try {
      console.log(`ClientAgent: Requesting log analysis for ${logFilePath}`);
      const analysisResult = await this.logParser.analyzeLog(logFilePath);
      this.state.logParserFindings = analysisResult;
      let responseText = "Log analysis complete. ";
      if (analysisResult.summary) {
        responseText += `Summary: ${analysisResult.summary} `;
      }
      if (analysisResult.identifiedErrorCode) {
        this.state.identifiedErrorCodeFromLog =
          analysisResult.identifiedErrorCode;
        responseText += `Identified Error Code: ${analysisResult.identifiedErrorCode}. `;
      }
      if (analysisResult.identifiedTrackingId) {
        this.state.identifiedTrackingIdFromLog =
          analysisResult.identifiedTrackingId;
        responseText += `Identified Tracking ID: ${analysisResult.identifiedTrackingId}. `;
      }
      if (
        !analysisResult.summary &&
        !analysisResult.identifiedErrorCode &&
        !analysisResult.identifiedTrackingId
      ) {
        responseText =
          "Log analysis complete, but no specific summary, error code, or tracking ID was extracted.";
      }
      console.log(
        `ClientAgent: Log analysis result: ${JSON.stringify(analysisResult)}`
      );
      return responseText;
    } catch (error) {
      console.error(`ClientAgent: Error during log analysis: ${error.message}`);
      return `There was an error analyzing the log file: ${error.message}`;
    }
  }

  generateFollowUps(agentResponse) {
    const followUps = [];
    if (this.state.identifiedErrorCodeFromLog) {
      followUps.push(
        `What does error code ${this.state.identifiedErrorCodeFromLog} mean?`
      );
    }
    if (agentResponse.toLowerCase().includes("describe it in more detail")) {
      followUps.push("What is the exact error message you are seeing?");
      followUps.push("When did this issue start happening?");
    }
    return followUps.length > 0 ? followUps : null;
  }

  getState() {
    return this.state;
  }
}

export default ClientAgent; // Changed to ESM export
