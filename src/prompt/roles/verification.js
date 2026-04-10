// Verification Agent Role
// Adversarial reviewer that demands proof, not trust

const ROLE_NAME = 'verification';

/**
 * Verification role sections - in priority order
 */
const SECTIONS = [
  'verification_skepticism',
];

/**
 * Tools available to this role
 * Verification typically doesn't need write tools
 */
const TOOLS = ['search_replace'];  // Read-only verification allows search only

/**
 * Build the verification role prompt
 * @param {object} context - Optional context overrides
 * @returns {string} - Role-specific system prompt additions
 */
function buildVerificationRole(context = {}) {
  const verificationSkepticism = require('../sections/verification_skepticism');

  return [
    "",
    "========================================",
    "ROLE: VERIFICATION AGENT",
    "========================================",
    verificationSkepticism.buildVerificationSkepticism(),
  ].join("\n");
}

module.exports = {
  ROLE_NAME,
  SECTIONS,
  TOOLS,
  buildVerificationRole,
};
