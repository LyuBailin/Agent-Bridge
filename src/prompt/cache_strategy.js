/**
 * Cache Strategy
 * Part of the Control Plane's context economics
 * Maximizes prompt caching efficiency via prefix-loading
 */

// Import static sections (these don't change often)
const { buildIdentityDefinition } = require('./identity');
const { buildSystemRules } = require('./system_rules');
const { buildOperationGuidelines } = require('./operation_guidelines');
const { buildOutputDiscipline } = require('./output_discipline');

// Import dynamic sections (change per session)
const { buildEngineeringDonts } = require('./sections/engineering_donts');
const { buildActionSequence } = require('./sections/action_sequence');
const { buildVerificationSkepticism } = require('./sections/verification_skepticism');
const { buildReadOnlyBoundaries } = require('./sections/readonly_boundaries');
const { buildCoordinatorSynthesis } = require('./sections/coordinator_synthesis');
const { buildMemoryIndexing } = require('./sections/memory_indexing');
const { buildResumeRecovery } = require('./sections/resume_recovery');
const { buildBashConstraints } = require('./sections/bash_constraints');

/**
 * Static sections - loaded FIRST, rarely change
 * These should be placed at the BEGINNING of the prompt for cache hits
 */
const STATIC_SECTIONS = [
  {
    name: 'identity',
    builder: buildIdentityDefinition,
    description: 'Model identity and core responsibilities',
  },
  {
    name: 'system_rules',
    builder: buildSystemRules,
    description: 'Security constraints and execution boundaries',
  },
  {
    name: 'operation_guidelines',
    builder: buildOperationGuidelines,
    description: 'SEARCH/REPLACE vs file operations syntax',
  },
  {
    name: 'output_discipline',
    builder: buildOutputDiscipline,
    description: 'Output format and validation standards',
  },
];

/**
 * Dynamic sections - loaded LAST, change per session
 * These go after the cache boundary marker
 */
const DYNAMIC_SECTIONS = [
  {
    name: 'engineering_donts',
    builder: buildEngineeringDonts,
    description: 'Anti-over-engineering rules',
  },
  {
    name: 'action_sequence',
    builder: buildActionSequence,
    description: 'Read-before-edit enforcement',
  },
  {
    name: 'verification_skepticism',
    builder: buildVerificationSkepticism,
    description: 'Adversarial verification stance',
  },
  {
    name: 'readonly_boundaries',
    builder: buildReadOnlyBoundaries,
    description: 'Read-only exploration restrictions',
  },
  {
    name: 'coordinator_synthesis',
    builder: buildCoordinatorSynthesis,
    description: 'Coordinator synthesis requirements',
  },
  {
    name: 'memory_indexing',
    builder: buildMemoryIndexing,
    description: 'Memory system discipline',
  },
  {
    name: 'resume_recovery',
    builder: buildResumeRecovery,
    description: 'Resume protocol for token limits',
  },
  {
    name: 'bash_constraints',
    builder: buildBashConstraints,
    description: 'Bash rules of engagement (if enabled)',
  },
];

/**
 * Build the cache prefix - stable content for API cache hit
 * Place this at the very beginning of the prompt
 */
function getCachePrefix() {
  return STATIC_SECTIONS.map((s) => s.builder()).join("\n");
}

/**
 * Build the dynamic suffix - session-specific content
 * Changes frequently, should NOT be placed at prompt prefix
 */
function getDynamicSuffix(roleSections = []) {
  // Filter to only requested dynamic sections if specified
  const sectionsToInclude = roleSections.length > 0
    ? DYNAMIC_SECTIONS.filter((s) => roleSections.includes(s.name))
    : DYNAMIC_SECTIONS;

  return sectionsToInclude.map((s) => s.builder()).join("\n");
}

/**
 * Build full system prompt with cache optimization
 * @param {object} options - Configuration options
 * @param {string[]} options.roleSections - Names of dynamic sections to include
 * @param {boolean} options.includeBoundary - Include boundary marker
 * @returns {object} - { prefix, suffix, boundary, full }
 */
function buildOptimizedPrompt(options = {}) {
  const { roleSections = [], includeBoundary = true } = options;

  const prefix = getCachePrefix();
  const suffix = getDynamicSuffix(roleSections);
  const boundary = includeBoundary ? "<!-- SYSTEM_PROMPT_DYNAMIC_BOUNDARY -->" : "";

  let full = prefix;
  if (suffix.trim()) {
    full += `\n${boundary}\n${suffix}`;
  }

  return { prefix, suffix, boundary, full };
}

/**
 * Get section names for a specific role
 * Used to filter which dynamic sections to include
 */
function getSectionsForRole(roleName) {
  const roleSectionMap = {
    implementation: ['engineering_donts', 'action_sequence'],
    verification: ['verification_skepticism'],
    planning: ['coordinator_synthesis'],
    readonly_explore: ['readonly_boundaries'],
    default: ['engineering_donts', 'action_sequence'],
  };

  return roleSectionMap[roleName] || roleSectionMap.default;
}

/**
 * Check if cache prefix is stable (no dynamic content)
 */
function isCacheStable() {
  // Static sections should not change between calls
  // If they do, the entire cache is invalidated
  return true; // Static sections are truly stable by design
}

module.exports = {
  STATIC_SECTIONS,
  DYNAMIC_SECTIONS,
  getCachePrefix,
  getDynamicSuffix,
  buildOptimizedPrompt,
  getSectionsForRole,
  isCacheStable,
};
