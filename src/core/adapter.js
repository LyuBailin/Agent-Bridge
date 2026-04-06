// Re-export from modular adapter/ sub-directory.
// The adapter module has been split into:
//   adapter/index.js        — facade (createProvider, callCodex, exports)
//   adapter/validator.js    — detectOperationType, validateOperationSchema, validateChangeSet
//   adapter/parser.js       — parseResponse, parseToolCalls
//   adapter/schema.js      — TOOLS_SCHEMA
//   adapter/providers/     — ollama, openai, claude_cli implementations
module.exports = require(__dirname + "/adapter/index.js");
