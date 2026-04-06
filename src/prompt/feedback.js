// Feedback history module
function buildFeedbackModule(feedbackHistory = []) {
  if (!Array.isArray(feedbackHistory) || feedbackHistory.length === 0) {
    return "";
  }

  return [
    "",
    "PREVIOUS FAILURES (fix these and retry with correct sr blocks):",
    ...feedbackHistory.slice(-3).map((f, idx) => {
      const rawMsg = f?.message ?? String(f);
      const stage = f?.stage ?? "unknown";
      const details = f?.details ? ` details=${JSON.stringify(f.details).slice(0, 800)}` : "";
      const msg = String(rawMsg ?? "");
      if (!msg.includes("\n")) {
        return `${idx + 1}. stage=${stage}: ${msg}${details}`;
      }

      const lines = msg.split(/\r?\n/);
      const first = lines.shift() ?? "";
      const rest = lines.map((l) => `  ${l}`).join("\n");
      return `${idx + 1}. stage=${stage}: ${first}${details}\n${rest}`;
    }),
    "",
    "Constraints reminder:",
    "- Output ONLY ```sr or ```op blocks (no prose).",
    "- Use ```sr for content editing, ```op for file system operations (mkdir/mv/rm).",
    "- Keep changes minimal.",
    "- Do not touch .git or any path outside workspace."
  ].join("\n");
}

module.exports = {
  buildFeedbackModule
};