/**
 * Simulation mode utilities for testing without real API calls.
 * Controls all mock response file reading via environment variables.
 */

const fs = require("node:fs/promises");
const path = require("node:path");

// Simulation environment variable names
const SIMULATION_ENV = {
  // Text response simulation (adapter.js - model responses)
  RESPONSE_FILE: "AGENT_BRIDGE_RESPONSE_FILE",
  RESPONSE_FILES: "AGENT_BRIDGE_RESPONSE_FILES",
  RESPONSE_FILES_IDX: "AGENT_BRIDGE_RESPONSE_FILES_IDX",

  // JSON response simulation (planner.js - plan/replan responses)
  PLAN_RESPONSE_FILE: "AGENT_BRIDGE_PLAN_RESPONSE_FILE",
  PLAN_RESPONSE_FILES: "AGENT_BRIDGE_PLAN_RESPONSE_FILES",
  PLAN_RESPONSE_FILES_IDX: "AGENT_BRIDGE_PLAN_RESPONSE_FILES_IDX",

  // JSON response simulation (adapter.js - review responses)
  REVIEW_RESPONSE_FILE: "AGENT_BRIDGE_REVIEW_RESPONSE_FILE",
  REVIEW_RESPONSE_FILES: "AGENT_BRIDGE_REVIEW_RESPONSE_FILES",
  REVIEW_RESPONSE_FILES_IDX: "AGENT_BRIDGE_REVIEW_RESPONSE_FILES_IDX",

  // JSON response simulation (planner.js - replan responses)
  REPLAN_RESPONSE_FILE: "AGENT_BRIDGE_REPLAN_RESPONSE_FILE",
  REPLAN_RESPONSE_FILES: "AGENT_BRIDGE_REPLAN_RESPONSE_FILES",
  REPLAN_RESPONSE_FILES_IDX: "AGENT_BRIDGE_REPLAN_RESPONSE_FILES_IDX",
};

/**
 * Reads mock text response from environment variables.
 * Returns null if no simulation is active (env vars not set).
 *
 * @param {Object} options
 * @param {string} options.singleVar - Env var name for single file path
 * @param {string} options.listVar - Env var name for comma-separated file list
 * @param {string} options.listIdxVar - Env var name for current index (0-based)
 * @returns {Promise<string|null>} Mock content or null
 */
async function readMockTextFromEnv({ singleVar, listVar, listIdxVar }) {
  // Single file mode
  const mockPath = process.env[singleVar];
  if (mockPath) {
    const abs = path.resolve(mockPath);
    return await fs.readFile(abs, "utf8");
  }

  // List mode (sequential)
  const mockList = process.env[listVar];
  if (mockList) {
    const files = mockList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (files.length > 0) {
      const idx =
        Number.parseInt(process.env[listIdxVar] ?? "0", 10) || 0;
      const filePath = files[idx % files.length];
      const abs = path.resolve(filePath);
      // Advance index for next call
      process.env[listIdxVar] = String(idx + 1);
      return await fs.readFile(abs, "utf8");
    }
  }

  return null;
}

/**
 * Reads mock JSON response from environment variables.
 * Returns null if no simulation is active (env vars not set).
 *
 * @param {Object} options
 * @param {string} options.singleVar - Env var name for single file path
 * @param {string} options.listVar - Env var name for comma-separated file list
 * @param {string} options.listIdxVar - Env var name for current index (0-based)
 * @returns {Promise<object|null>} Parsed JSON or null
 */
async function readMockJsonFromEnv({ singleVar, listVar, listIdxVar }) {
  const text = await readMockTextFromEnv({ singleVar, listVar, listIdxVar });
  if (text === null) return null;
  return JSON.parse(text);
}

module.exports = {
  SIMULATION_ENV,
  readMockTextFromEnv,
  readMockJsonFromEnv,
};
