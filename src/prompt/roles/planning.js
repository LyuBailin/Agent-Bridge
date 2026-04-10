// Planning Agent Role
// Decomposes complex tasks into manageable subtasks

const ROLE_NAME = 'planning';

/**
 * Planning role sections
 */
const SECTIONS = [
  'coordinator_synthesis',
];

/**
 * Tools available to this role
 * Planning typically uses minimal toolset
 */
const TOOLS = ['search_replace'];  // Read workspace context only

/**
 * Build the planning role prompt
 * Uses the existing plan.js functions but wraps with role context
 * @param {object} context - Optional context with maxSubtasks
 * @returns {string} - Role-specific system prompt additions
 */
function buildPlanningRole(context = {}) {
  const plan = require('../plan');
  const coordinatorSynthesis = require('../sections/coordinator_synthesis');

  const maxSubtasks = context.maxSubtasks || 10;

  return [
    "",
    "========================================",
    "ROLE: PLANNING AGENT",
    "========================================",
    plan.buildPlanSystemPrompt(maxSubtasks),
    coordinatorSynthesis.buildCoordinatorSynthesis(),
  ].join("\n");
}

module.exports = {
  ROLE_NAME,
  SECTIONS,
  TOOLS,
  buildPlanningRole,
};
