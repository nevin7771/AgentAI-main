import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class LogParserAgent {
  constructor() {
    this.pythonScriptPath = path.join(
      __dirname,
      "..",
      "log_analysis",
      "log_parser.py"
    );
    this.pythonInterpreter = "python3";
  }

  async analyzeLog(logFilePath) {
    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonInterpreter, [
        this.pythonScriptPath,
        logFilePath,
      ]);
      let stdoutData = "";
      let stderrData = "";

      process.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderrData += data.toString();
      });

      process.on("close", (code) => {
        if (code !== 0) {
          console.error(
            `LogParserAgent: Python script exited with code ${code}`
          );
          console.error(`LogParserAgent: stderr: ${stderrData}`);
          return reject(
            new Error(
              `Log analysis failed. Exit code: ${code}. Error: ${
                stderrData || "Unknown error"
              }`
            )
          );
        }
        try {
          const result = JSON.parse(stdoutData);
          resolve(result);
        } catch (error) {
          console.error(
            `LogParserAgent: Error parsing Python script output: ${error}`
          );
          console.error(`LogParserAgent: stdout: ${stdoutData}`);
          reject(new Error("Failed to parse log analysis result."));
        }
      });

      process.on("error", (error) => {
        console.error(
          `LogParserAgent: Failed to start Python script: ${error}`
        );
        reject(new Error("Failed to start log analysis process."));
      });
    });
  }
}

export default LogParserAgent;
