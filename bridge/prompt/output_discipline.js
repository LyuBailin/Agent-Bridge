// 构建输出纪律模块
function buildOutputDiscipline() {
  return [
    "",
    "========================================",
    "OUTPUT DISCIPLINE",
    "========================================",
    "1. FORMAT REQUIREMENTS:",
    "   - Output ONLY ```sr or ```op blocks",
    "   - No extra prose, explanations, or comments",
    "   - No git patches or unified diffs",
    "   - Use proper indentation and formatting",
    "",
    "2. VALIDATION STANDARDS:",
    "   - All changes must be syntactically correct",
    "   - All paths must be valid and within the workspace",
    "   - All SEARCH patterns must match existing content exactly (when non-empty)",
    "   - All operations must be safe and reversible",
    "",
    "3. COMPLETION CRITERIA:",
    "   - Code changes successfully applied",
    "   - Syntax and semantic validation passed",
    "   - No unresolved errors or warnings",
    "   - All engineering constraints satisfied"
  ].join("\n");
}

module.exports = {
  buildOutputDiscipline
};