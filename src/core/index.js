// Core module barrel — re-exports all public APIs.
const main = require("./main");
const adapter = require("./adapter");
const planner = require("./planner");
const gitManager = require("./git_manager");
const verifier = require("./verifier");
const fsTools = require("../utils/fs_tools");
const snippetFeedback = require("../utils/snippet_feedback");

module.exports = {
  // Main entry
  main,
  // Core modules
  adapter,
  planner,
  gitManager,
  verifier,
  fsTools,
  snippetFeedback,
  // Submodules (for consumers who want granular access)
  polling: require("./polling"),
  workflow: require("./workflow"),
  adapterProviders: require("./adapter/providers")
};
