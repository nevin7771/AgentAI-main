// server/log_analysis/logAnalyzer.js

import { PythonShell } from "python-shell";
import path from "path";
import { fileURLToPath } from "url";

// Resolve directory paths relative to the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT_PATH = path.join(__dirname, "log_parser.py");
const DEFINITIONS_PATH = path.join(__dirname, "log_definitions.json");
const SAMPLE_LOG_PATH = path.join(__dirname, "sample.log"); // Used by the dummy script

/**
 * Analyzes log content by executing the Python log parser script.
 *
 * @param {string} logInput - Either the direct log content as a string or the absolute path to the log file.
 * @returns {Promise<object>} - A promise that resolves to the analysis result (JSON object) from the Python script.
 */
const analyzeLogs = async (logInput) => {
  console.log(
    `[LogAnalyzer] Starting analysis for input: ${logInput.substring(0, 50)}...`
  );

  const options = {
    mode: "text",
    pythonOptions: ["-u"], // get print results in real-time
    scriptPath: path.dirname(SCRIPT_PATH),
    args: [logInput, DEFINITIONS_PATH, SAMPLE_LOG_PATH],
  };

  return new Promise((resolve, reject) => {
    PythonShell.run(path.basename(SCRIPT_PATH), options)
      .then((messages) => {
        // messages is an array of strings received from stdout
        try {
          // Assuming the Python script prints a single JSON string as its final output
          const resultJson = messages[messages.length - 1];
          const result = JSON.parse(resultJson);
          console.log("[LogAnalyzer] Analysis successful.");
          resolve(result);
        } catch (parseError) {
          console.error(
            "[LogAnalyzer] Error parsing Python script output:",
            parseError
          );
          console.error("[LogAnalyzer] Raw output:", messages);
          reject(new Error("Failed to parse log analysis result."));
        }
      })
      .catch((err) => {
        console.error("[LogAnalyzer] Error executing Python script:", err);
        reject(new Error(`Log analysis script failed: ${err.message}`));
      });
  });
};

export { analyzeLogs };
