// Implementation Agent Role
// Default role for code generation and editing tasks

const ROLE_NAME = 'implementation';

/**
 * Implementation role sections - in priority order
 * These are ADDED to the default sections
 */
const SECTIONS = [
  'engineering_donts',
  'action_sequence',
];

/**
 * Tools available to this role
 * null = use default toolset
 */
const TOOLS = null;  // Uses full toolset: search_replace, mkdir, mv, rm

/**
 * Build the implementation role prompt
 * @param {object} context - Optional context overrides
 * @returns {string} - Role-specific system prompt additions
 */
function buildImplementationRole(context = {}) {
  const engineeringDonts = require('../sections/engineering_donts');
  const actionSequence = require('../sections/action_sequence');

  return [
    "",
    "========================================",
    "ROLE: IMPLEMENTATION AGENT",
    "========================================",
    engineeringDonts.buildEngineeringDonts(),
    actionSequence.buildActionSequence(),
  ].join("\n");
}

module.exports = {
  ROLE_NAME,
  SECTIONS,
  TOOLS,
  buildImplementationRole,
};
