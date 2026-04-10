/**
 * Role Factory
 * Builds role-specific prompts by composing section modules
 */

const ROLES = {
  implementation: require('./roles/implementation'),
  verification: require('./roles/verification'),
  planning: require('./roles/planning'),
  readonly_explore: require('./roles/readonly_explore'),
};

// Import base section builders
const {
  buildIdentityDefinition,
  buildSystemRules,
  buildOperationGuidelines,
  buildOutputDiscipline,
} = require('./identity');

const { buildSystemRules: buildSystemRulesSection } = require('./system_rules');
const { buildOperationGuidelines: buildOpGuidelines } = require('./operation_guidelines');
const { buildOutputDiscipline: buildOutDiscipline } = require('./output_discipline');

/**
 * Build system prompt for a specific role
 * @param {string} roleName - One of: implementation, verification, planning, readonly_explore
 * @param {object} context - Optional context for role-specific configuration
 * @returns {string} - Complete system prompt for the role
 */
function buildRolePrompt(roleName, context = {}) {
  const role = ROLES[roleName];
  if (!role) {
    throw new Error(`Unknown role: ${roleName}. Available: ${Object.keys(ROLES).join(', ')}`);
  }

  // Base sections (in priority order)
  const baseSections = [
    buildIdentityDefinition(),
    buildSystemRulesSection(),
    buildOpGuidelines(),
    buildOutDiscipline(),
  ];

  // Role-specific sections - call the role's build function
  // Role modules export build[PascalCaseRoleName]Role functions
  // Map role names to function name suffixes
  const roleFunctionSuffixes = {
    implementation: 'ImplementationRole',
    verification: 'VerificationRole',
    planning: 'PlanningRole',
    readonly_explore: 'ReadOnlyExploreRole',
  };
  const roleFunctionName = `build${roleFunctionSuffixes[roleName] || roleName}`;
  const roleFunction = role[roleFunctionName];
  const roleSections = roleFunction ? [roleFunction(context)] : [];

  // Combine and return
  return [...baseSections, ...roleSections].join("\n");
}

/**
 * Get the available roles
 * @returns {string[]} - List of role names
 */
function getAvailableRoles() {
  return Object.keys(ROLES);
}

/**
 * Get tools available for a specific role
 * @param {string} roleName - Role name
 * @returns {string[]|null} - List of allowed tools or null for default toolset
 */
function getRoleTools(roleName) {
  const role = ROLES[roleName];
  return role ? role.TOOLS : null;
}

module.exports = {
  buildRolePrompt,
  getAvailableRoles,
  getRoleTools,
  ROLES,
};
