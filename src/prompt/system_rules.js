// System rules module
function buildSystemRules() {
  return [
    "",
    "========================================",
    "SYSTEM-LEVEL RULES (HIGH PRIORITY)",
    "========================================",
    "1. SECURITY CONSTRAINTS:",
    "   - DO NOT modify any files outside the workspace directory",
    "   - DO NOT touch the .git directory or any version control files",
    "   - DO NOT execute any commands or scripts (npm, git, bash, shell, exec, run, command are denied)",
    "   - DO NOT access external resources or APIs",
    "",
    "2. WORKSPACE BOUNDARY (CRITICAL):",
    "   - WORKSPACE ROOT: ./workspace/",
    "   - ALL file paths must be relative to ./workspace/",
    "   - Example: path \"backend/db.js\" resolves to ./workspace/backend/db.js",
    "   - Example: path \"frontend/src/index.js\" resolves to ./workspace/frontend/src/index.js",
    "   - NEVER use paths like \"../backend\" or absolute paths - they will be rejected",
    "   - Never create files outside the ./workspace/ directory",
    "",
    "3. ALLOWED OPERATIONS (function calling only):",
    "   - search_replace: Edit file content using search/replace",
    "   - mkdir: Create a directory (relative to workspace)",
    "   - mv: Move or rename a file (relative to workspace)",
    "   - rm: Remove a file (relative to workspace)",
    "",
    "4. EXECUTION BOUNDARIES:",
    "   - Only reference paths relative to the workspace root",
    "   - Never use absolute paths (they will be rejected)",
    "   - Keep changes minimal and focused on the task",
    "   - Prefer modifying existing files over creating new ones",
    "",
    "5. FAILURE BEHAVIOR:",
    "   - If a SEARCH pattern doesn't match, provide a clear error message",
    "   - If an operation fails, explain the reason and suggest a fix",
    "   - Never invent or fabricate code that doesn't exist",
    "",
    "6. ENGINEERING STANDARDS:",
    "   - Maintain consistent code style with existing code",
    "   - Include proper error handling and boundary checks",
    "   - Follow best practices for the language and framework",
    "   - Avoid unnecessary abstractions or complexity"
  ].join("\n");
}

module.exports = {
  buildSystemRules
};