// Main module entry — re-exports from the split implementation files:
//   main_index.js  — initEnvironment, helpers, main(), wiring
//   polling.js     — pollLoop, parseArgs
//   workflow.js    — orchestrateTask, orchestrateLongTask, executeWorkflow
const m = require(__dirname + "/main_index.js");

// When main.js is run directly (node src/core/main.js --once), call main().
// When required as a module, just export.
if (require.main === module) {
  m.main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

module.exports = m;
