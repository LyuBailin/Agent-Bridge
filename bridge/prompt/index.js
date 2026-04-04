const { buildIdentityDefinition } = require('./identity');
const { buildSystemRules } = require('./system_rules');
const { buildOperationGuidelines } = require('./operation_guidelines');
const { buildOutputDiscipline } = require('./output_discipline');
const { buildFeedbackModule } = require('./feedback');

// 构建系统提示的模块化组件
function buildSystemPrompt() {
  const systemComponents = [
    buildIdentityDefinition(),
    buildSystemRules(),
    buildOperationGuidelines(),
    buildOutputDiscipline()
  ];

  return systemComponents.join("\n");
}

// 构建用户提示的模块化组件
function buildUserPrompt(task, feedbackHistory = [], operationType = null, contextText = "") {
  const userComponents = [
    `TASK_ID: ${task.task_id}`,
    operationType ? buildOperationConstraint(operationType) : '',
    "INSTRUCTION:",
    task.instruction,
    buildFeedbackModule(feedbackHistory),
    "WORKSPACE CONTEXT:",
    contextText
  ].filter(Boolean);

  return userComponents.join("\n");
}

// 构建操作类型约束
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

// 构建完整的 prompt
function buildPrompt(task, contextText, feedbackHistory = [], operationType = null) {
  const system = buildSystemPrompt();
  const user = buildUserPrompt(task, feedbackHistory, operationType, contextText);

  return { system, user, operationType };
}

module.exports = {
  buildPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  buildOperationConstraint,
  buildIdentityDefinition,
  buildSystemRules,
  buildOperationGuidelines,
  buildOutputDiscipline,
  buildFeedbackModule
};