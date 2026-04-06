const path = require("node:path");

function parseArgs(argv) {
  const out = { once: false, root: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--once") out.once = true;
    else if (a === "--root") out.root = path.resolve(argv[i + 1] ?? out.root);
  }
  return out;
}

async function pollLoop(env, deps, { once = false } = {}) {
  const { safeReadJson, sleep, appendLog, isQueuedTask, executeWorkflow } = deps;

  while (true) {
    let task;
    try {
      task = await safeReadJson(env.taskPath, null);
    } catch (e) {
      await appendLog(env.logPath, `task.json read error: ${e.message}`);
      if (once) return;
      await sleep(env.config.poll_interval_ms);
      continue;
    }

    if (isQueuedTask(task)) {
      await executeWorkflow(env, task);
      if (once) return;
    } else if (once) {
      return;
    }

    await sleep(env.config.poll_interval_ms);
  }
}

module.exports = { pollLoop, parseArgs };
