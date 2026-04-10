const { buildIdentityDefinition } = require('./identity');
const { buildSystemRules } = require('./system_rules');
const { buildOperationGuidelines } = require('./operation_guidelines');
const { buildOutputDiscipline } = require('./output_discipline');
const { buildFeedbackModule } = require('./feedback');

// Cache strategy for prompt optimization
const {
  buildOptimizedPrompt,
  getSectionsForRole,
  isCacheStable,
} = require('./cache_strategy');

// Role factory for role-specific prompts
const {
  buildRolePrompt,
  getAvailableRoles,
  getRoleTools,
} = require('./role_factory');

// Dynamic boundary marker for cache optimization
const CACHE_BOUNDARY = "<!-- SYSTEM_PROMPT_DYNAMIC_BOUNDARY -->";

// Modular system-prompt components
function buildSystemPrompt() {
  const { full } = buildOptimizedPrompt({
    roleSections: ['engineering_donts', 'action_sequence'],
    includeBoundary: true,
  });
  return full;
}

// Role-specific system prompt builder
function buildRoleSystemPrompt(roleName, context = {}) {
  return buildRolePrompt(roleName, context);
}

// Default format guidance when no operationType specified
function buildDefaultFormatGuidance() {
  return `
========================================
⚠️  OUTPUT FORMAT: sr AND op BLOCKS
========================================
Output code changes using ONLY these block types:

1. SEARCH/REPLACE (sr blocks) - For creating or editing files:
\`\`\`sr
FILE: path/to/file.js
SEARCH:
<<<
exact text to find
>>>
REPLACE:
<<<
new text to insert
>>>
\`\`\`
(Use empty SEARCH to create a new file)

2. FILE OPERATIONS (op blocks) - For directories and file moves/deletes:
\`\`\`op
MKDIR: path/to/dir
MV: old/path.js -> new/path.js
RM: path/to/file.js
\`\`\`

DO NOT output bash commands, shell commands, or anything else.
========================================
`;
}

// Modular user-prompt builder
function buildUserPrompt(task, feedbackHistory = [], operationType = null, contextText = "") {
  const userComponents = [
    "========================================",
    "CRITICAL: WORKSPACE BOUNDARY",
    "========================================",
    "Workspace root is: ./workspace/",
    "- ALL file paths are relative to ./workspace/",
    "- Example: \"src/index.js\" means ./workspace/src/index.js",
    "- Example: \"backend/db.js\" means ./workspace/backend/db.js",
    "- NEVER use paths outside ./workspace/",
    "========================================",
    "",
    `TASK_ID: ${task.task_id}`,
    operationType ? buildOperationConstraint(operationType) : buildDefaultFormatGuidance(),
    "INSTRUCTION:",
    task.instruction,
    buildFeedbackModule(feedbackHistory),
    "WORKSPACE CONTEXT:",
    contextText
  ].filter(Boolean);

  return userComponents.join("\n");
}

// Operation-type constraint builder
function buildOperationConstraint(operationType) {
  if (operationType === 'fileops-only') {
    return `
========================================
⚠️  OPERATION TYPE: FILE OPERATIONS ONLY
========================================
YOU MUST OUTPUT ONLY \`\`\`op BLOCKS.
DO NOT OUTPUT \`\`\`sr BLOCKS.

Allowed operations:
- MKDIR: dirname (create directory)
- MV: source -> target (move/rename file)
- RM: filepath (delete file)

Examples of CORRECT output:
\`\`\`op
MV: old-path.js -> new-path.js
MKDIR: lib
RM: unused.js
\`\`\`

Examples of INCORRECT output (will be REJECTED):
- \`\`\`sr blocks - NOT ALLOWED for this task
- File content edits - NOT ALLOWED for this task
`;
  } else if (operationType === 'content-only') {
    return `
========================================
⚠️  OPERATION TYPE: CONTENT EDITING ONLY
========================================
YOU MUST OUTPUT ONLY \`\`\`sr BLOCKS.
DO NOT OUTPUT \`\`\`op BLOCKS.

Allowed operations:
- SEARCH/REPLACE: modify file contents
- Create new files with empty SEARCH

Examples of CORRECT output:
\`\`\`sr
FILE: app.js
SEARCH:
<<<
const old = require('./old');
>>>
REPLACE:
<<<
const old = require('./new');
>>>
\`\`\`

Examples of INCORRECT output (will be REJECTED):
- \`\`\`op blocks with MV, MKDIR, RM - NOT ALLOWED for this task
- File system operations - NOT ALLOWED for this task
`;
  }

  return ''; // For 'mixed', no additional constraint needed
}

// Full prompt builder
function buildPrompt(task, contextText, feedbackHistory = [], operationType = null) {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(task, feedbackHistory, operationType, contextText);

  return { system, user, operationType };
}

// Self-correction prompt for parse failure recovery
function buildCorrectionPrompt(task, contextText, errorInfo, snippetFeedback, operationType = null) {
  const system = buildSystemPrompt();
  const errorMsg = errorInfo?.message ?? String(errorInfo ?? "unknown parse error");
  const errorDetails = errorInfo?.details ? JSON.stringify(errorInfo.details).slice(0, 500) : "";

  const correctionUserPrompt = [
    "========================================",
    "CRITICAL: WORKSPACE BOUNDARY",
    "========================================",
    "Workspace root is: ./workspace/",
    "- ALL file paths are relative to ./workspace/",
    "- Example: \"src/index.js\" means ./workspace/src/index.js",
    "- Example: \"backend/db.js\" means ./workspace/backend/db.js",
    "- NEVER use paths outside ./workspace/",
    "========================================",
    "",
    `TASK_ID: ${task.task_id}`,
    operationType ? buildOperationConstraint(operationType) : '',
    "INSTRUCTION:",
    task.instruction,
    "",
    "=== PARSE FAILURE - PLEASE CORRECT ===",
    `ERROR: ${errorMsg}`,
    errorDetails ? `DETAILS: ${errorDetails}` : "",
    "",
    "FILE SNIPPETS (current file state):",
    snippetFeedback && typeof snippetFeedback === 'string' ? snippetFeedback : "(no snippets available)",
    "",
    "Please output CORRECTED blocks that will parse successfully.",
    "Common issues to fix:",
    "- SEARCH patterns must exactly match existing content",
    "- All paths must be valid relative paths within ./workspace/",
    "- Block format must be exactly ```sr or ```op with proper indentation",
    "- REPLACE content must not be empty",
    "- Workspace boundary: paths like \"backend/\" are ALREADY inside workspace (./workspace/backend/)",
    "",
    "OUTPUT ONLY ```sr or ```op blocks (no prose)."
  ].filter(Boolean).join("\n");

  return { system, user: correctionUserPrompt, operationType };
}

module.exports = {
  buildPrompt,
  buildCorrectionPrompt,
  buildSystemPrompt,
  buildRoleSystemPrompt,
  buildUserPrompt,
  buildOperationConstraint,
  buildIdentityDefinition,
  buildSystemRules,
  buildOperationGuidelines,
  buildOutputDiscipline,
  buildFeedbackModule,
  // Export role factory utilities
  buildRolePrompt,
  getAvailableRoles,
  getRoleTools,
  // Export cache strategy utilities
  buildOptimizedPrompt,
  getSectionsForRole,
  isCacheStable,
  // Export boundary marker
  CACHE_BOUNDARY,
};
