// 构建系统级规则模块
function buildSystemRules() {
  return [
    "",
    "========================================",
    "SYSTEM-LEVEL RULES (HIGH PRIORITY)",
    "========================================",
    "1. SECURITY CONSTRAINTS:",
    "   - DO NOT modify any files outside the workspace directory",
    "   - DO NOT touch the .git directory or any version control files",
    "   - DO NOT execute any commands or scripts",
    "   - DO NOT access external resources or APIs",
    "",
    "2. EXECUTION BOUNDARIES:",
    "   - Only reference paths relative to the workspace root",
    "   - Never use absolute paths",
    "   - Keep changes minimal and focused on the task",
    "   - Prefer modifying existing files over creating new ones",
    "",
    "3. FAILURE BEHAVIOR:",
    "   - If a SEARCH pattern doesn't match, provide a clear error message",
    "   - If an operation fails, explain the reason and suggest a fix",
    "   - Never invent or fabricate code that doesn't exist",
    "",
    "4. ENGINEERING STANDARDS:",
    "   - Maintain consistent code style with existing code",
    "   - Include proper error handling and boundary checks",
    "   - Follow best practices for the language and framework",
    "   - Avoid unnecessary abstractions or complexity"
  ].join("\n");
}

module.exports = {
  buildSystemRules
};