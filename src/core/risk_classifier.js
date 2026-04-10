/**
 * Risk Classifier: Speculative Risk Prediction
 *
 * Runs in parallel with permission checks to provide instant risk assessment.
 * By the time the system is ready to ask for approval, risk assessment is ready.
 */

const path = require("node:path");

/**
 * Risk level definitions.
 * Critical and High block execution immediately.
 * Medium and Low are advisory.
 */
const RISK_LEVELS = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical"
};

/**
 * Risk patterns for each tool.
 * Patterns are checked in order; first match determines risk level.
 */
const RISK_PATTERNS = {
  search_replace: [
    {
      pattern: /rm\s+(-rf|-r\s*-f|-f\s*-r)/i,
      risk: RISK_LEVELS.CRITICAL,
      message: "Contains recursive force delete command"
    },
    {
      pattern: /\$\(/,
      risk: RISK_LEVELS.HIGH,
      message: "Contains command substitution"
    },
    {
      pattern: /eval|exec\s+/i,
      risk: RISK_LEVELS.HIGH,
      message: "Contains dynamic code execution"
    }
  ],
  rm: [
    {
      pattern: /^\s*$/,
      risk: RISK_LEVELS.HIGH,
      message: "Empty path specified"
    },
    {
      pattern: /(^|\/)\.\.(\/|$)/,
      risk: RISK_LEVELS.HIGH,
      message: "Path attempts directory traversal"
    },
    {
      pattern: /(^|\/)(node_modules|\.git)(\/|$)/,
      risk: RISK_LEVELS.HIGH,
      message: "Would delete critical project directory"
    }
  ],
  mv: [
    {
      pattern: /(^|\/)\.\.(\/|$)/,
      risk: RISK_LEVELS.MEDIUM,
      message: "Path contains directory traversal"
    }
  ],
  mkdir: [
    {
      pattern: /(^|\/)\.\.(\/|$)/,
      risk: RISK_LEVELS.MEDIUM,
      message: "Path contains directory traversal"
    }
  ]
};

/**
 * Classify risk for a single tool call.
 * Returns risk level and assessment message.
 */
function classifyToolRisk(toolName, args) {
  const patterns = RISK_PATTERNS[toolName] || [];

  for (const rule of patterns) {
    const argsString = JSON.stringify(args);
    if (rule.pattern.test(argsString)) {
      return {
        level: rule.risk,
        message: rule.message,
        tool: toolName
      };
    }
  }

  // Default risk levels based on tool type
  const defaultRisks = {
    search_replace: RISK_LEVELS.LOW,
    mkdir: RISK_LEVELS.LOW,
    mv: RISK_LEVELS.MEDIUM,
    rm: RISK_LEVELS.HIGH  // rm is always at least HIGH
  };

  return {
    level: defaultRisks[toolName] || RISK_LEVELS.MEDIUM,
    message: null,
    tool: toolName
  };
}

/**
 * Classify risk for an entire batch of tool calls.
 * Runs in parallel - no sequential dependencies.
 *
 * @param {Array} toolCalls - Array of tool call objects
 * @returns {Object} - { overallRisk: string, individualRisks: Array, blockingIssues: Array }
 */
function classifyBatchRisk(toolCalls) {
  const individualRisks = [];
  const blockingIssues = [];

  // Classify each tool call in parallel
  for (const toolCall of toolCalls) {
    const name = toolCall.function?.name || toolCall.name;
    const args = typeof toolCall.function?.arguments === "string"
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function?.arguments || {};

    const risk = classifyToolRisk(name, args);
    individualRisks.push(risk);

    // Track blocking issues (Critical and High block execution)
    if (risk.level === RISK_LEVELS.CRITICAL || risk.level === RISK_LEVELS.HIGH) {
      blockingIssues.push(risk);
    }
  }

  // Overall risk is the maximum of individual risks
  const riskOrder = [RISK_LEVELS.LOW, RISK_LEVELS.MEDIUM, RISK_LEVELS.HIGH, RISK_LEVELS.CRITICAL];
  let maxRiskIdx = -1;
  for (const risk of individualRisks) {
    const idx = riskOrder.indexOf(risk.level);
    if (idx > maxRiskIdx) {
      maxRiskIdx = idx;
    }
  }

  return {
    overallRisk: riskOrder[maxRiskIdx] || RISK_LEVELS.MEDIUM,
    individualRisks,
    blockingIssues,
    requiresApproval: blockingIssues.length > 0
  };
}

module.exports = {
  RISK_LEVELS,
  classifyToolRisk,
  classifyBatchRisk
};
