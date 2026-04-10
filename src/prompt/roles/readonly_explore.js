// Read-Only Explore Agent Role
// Research agent with strict read-only access

const ROLE_NAME = 'readonly_explore';

/**
 * Read-only explore sections
 */
const SECTIONS = [
  'readonly_boundaries',
];

/**
 * Tools available - STRICTLY READ ONLY
 * No write, move, or delete operations
 */
const TOOLS = ['search_replace'];  // Only search allowed

/**
 * Build the read-only explore role prompt
 * @param {object} context - Optional context overrides
 * @returns {string} - Role-specific system prompt additions
 */
function buildReadOnlyExploreRole(context = {}) {
  const readonlyBoundaries = require('../sections/readonly_boundaries');

  return [
    "",
    "========================================",
    "ROLE: READ-ONLY EXPLORE AGENT",
    "========================================",
    readonlyBoundaries.buildReadOnlyBoundaries(),
  ].join("\n");
}

module.exports = {
  ROLE_NAME,
  SECTIONS,
  TOOLS,
  buildReadOnlyExploreRole,
};
