/**
 * Skill Injector
 * Part of the Control Plane's context economics
 * On-demand skill loading instead of preloading everything
 */

/**
 * Registered skills - loaded only when triggered
 * Each skill has a name and a loader function
 */
const REGISTERED_SKILLS = new Map();

/**
 * Register a skill for on-demand loading
 * @param {string} name - Skill identifier
 * @param {string|Function} content - Skill content string or loader function
 */
function registerSkill(name, content) {
  REGISTERED_SKILLS.set(name, {
    name,
    content: typeof content === 'function' ? content : () => content,
    loaded: false,
  });
}

/**
 * Register skills from a configuration object
 * @param {object} skills - { skillName: contentOrLoader }
 */
function registerSkills(skills) {
  for (const [name, content] of Object.entries(skills)) {
    registerSkill(name, content);
  }
}

/**
 * Load a specific skill by name
 * @param {string} name - Skill name
 * @returns {string|null} - Skill content or null if not found
 */
function loadSkill(name) {
  const skill = REGISTERED_SKILLS.get(name);
  if (!skill) {
    return null;
  }
  skill.loaded = true;
  return skill.content();
}

/**
 * Load multiple skills by name
 * @param {string[]} names - Skill names to load
 * @returns {string[]} - Array of loaded skill contents
 */
function loadSkills(names) {
  return names.map(loadSkill).filter(Boolean);
}

/**
 * Build skill prompt from triggered skills
 * Only includes skills that were explicitly requested
 * @param {string[]} triggeredSkills - Names of skills to include
 * @returns {string} - Combined skill prompt content
 */
function buildSkillPrompt(triggeredSkills = []) {
  if (triggeredSkills.length === 0) {
    return '';
  }

  const contents = loadSkills(triggeredSkills);
  if (contents.length === 0) {
    return '';
  }

  return [
    "",
    "========================================",
    "SKILLS ACTIVATED",
    "========================================",
    contents.join("\n\n"),
  ].join("\n");
}

/**
 * Check if a skill is registered
 * @param {string} name - Skill name
 * @returns {boolean}
 */
function hasSkill(name) {
  return REGISTERED_SKILLS.has(name);
}

/**
 * Get list of registered skill names
 * @returns {string[]}
 */
function getRegisteredSkills() {
  return Array.from(REGISTERED_SKILLS.keys());
}

/**
 * Preload common skills (optional - for eager loading)
 * @param {string[]} names - Skills to preload
 */
function preloadSkills(names) {
  loadSkills(names);
}

// Initialize with common skills
// These are loaded only when explicitly triggered in tasks
registerSkills({
  // Example skills - uncomment and configure as needed
  // 'git-management': 'Git management guidelines...',
  // 'regex-expert': 'Regex pattern guidelines...',
  // 'sql-best-practices': 'SQL optimization guidelines...',
});

module.exports = {
  registerSkill,
  registerSkills,
  loadSkill,
  loadSkills,
  buildSkillPrompt,
  hasSkill,
  getRegisteredSkills,
  preloadSkills,
};
