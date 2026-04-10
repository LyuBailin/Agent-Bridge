/**
 * Prompt Section Registry
 *
 * Manages section priority and loading order for the tiered system prompt.
 * Higher priority = loaded later = can override lower priority sections.
 *
 * Loading order: DEFAULT(40-90) → CUSTOM(100) → AGENT(200) → COORDINATOR(300) → OVERRIDE(400)
 */

// Section priorities - lower number = loaded earlier
const PROMPT_SECTIONS = {
  // Priority 0-30: Reserved for future use
  RESERVED: 0,

  // Priority 40-90: Default sections (base behavior)
  IDENTITY: 40,
  SYSTEM_RULES: 50,
  OPERATION_GUIDELINES: 60,
  OUTPUT_DISCIPLINE: 70,
  ENGINEERING_DONTS: 80,
  ACTION_SEQUENCE: 90,

  // Priority 100: Custom/user-provided sections
  CUSTOM: 100,

  // Priority 200: Agent-level rules
  AGENT: 200,
  VERIFICATION_SKEPTICISM: 210,

  // Priority 300: Coordinator-level rules
  COORDINATOR: 300,
  COORDINATOR_SYNTHESIS: 310,

  // Priority 400: Override sections (highest priority, loaded last)
  OVERRIDE: 400,

  // Priority 500: Session-specific dynamic content
  SESSION: 500,

  // Priority 600: Transient content (resume, interrupts)
  TRANSIENT: 600,
};

// Static sections are cacheable (rarely change per session)
const STATIC_SECTIONS = new Set([
  PROMPT_SECTIONS.IDENTITY,
  PROMPT_SECTIONS.SYSTEM_RULES,
  PROMPT_SECTIONS.OPERATION_GUIDELINES,
  PROMPT_SECTIONS.OUTPUT_DISCIPLINE,
  PROMPT_SECTIONS.ENGINEERING_DONTS,
  PROMPT_SECTIONS.ACTION_SEQUENCE,
  PROMPT_SECTIONS.VERIFICATION_SKEPTICISM,
  PROMPT_SECTIONS.COORDINATOR_SYNTHESIS,
]);

// Dynamic sections change per session or turn
const DYNAMIC_SECTIONS = new Set([
  PROMPT_SECTIONS.CUSTOM,
  PROMPT_SECTIONS.AGENT,
  PROMPT_SECTIONS.COORDINATOR,
  PROMPT_SECTIONS.OVERRIDE,
  PROMPT_SECTIONS.SESSION,
  PROMPT_SECTIONS.TRANSIENT,
]);

// Registered sections with their builder functions
const REGISTERED_SECTIONS = new Map();

/**
 * Register a section with the registry
 * @param {string} name - Section identifier
 * @param {number} priority - Loading priority (lower = earlier)
 * @param {Function} builder - Function that returns section content string
 * @param {boolean} isStatic - Whether section is cacheable
 */
function registerSection(name, priority, builder, isStatic = true) {
  REGISTERED_SECTIONS.set(name, {
    name,
    priority,
    builder,
    isStatic,
  });
  return REGISTERED_SECTIONS.get(name);
}

/**
 * Get all registered sections sorted by priority (ascending)
 */
function getSectionsByPriority() {
  return Array.from(REGISTERED_SECTIONS.values()).sort(
    (a, b) => a.priority - b.priority
  );
}

/**
 * Get sections filtered by static/dynamic
 */
function getSectionsByType(isStatic) {
  return Array.from(REGISTERED_SECTIONS.values())
    .filter((s) => s.isStatic === isStatic)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Build the cache prefix (static sections only)
 */
function buildCachePrefix() {
  const staticSections = getSectionsByType(true);
  return staticSections.map((s) => s.builder()).join("\n");
}

/**
 * Build the dynamic suffix (dynamic sections only)
 */
function buildDynamicSuffix() {
  const dynamicSections = getSectionsByType(false);
  return dynamicSections.map((s) => s.builder()).join("\n");
}

/**
 * Build full system prompt with dynamic boundary marker
 */
function buildSystemPromptWithBoundary() {
  const prefix = buildCachePrefix();
  const suffix = buildDynamicSuffix();
  const boundary = "<!-- SYSTEM_PROMPT_DYNAMIC_BOUNDARY -->";

  if (!suffix.trim()) {
    return prefix;
  }

  return `${prefix}\n${boundary}\n${suffix}`;
}

/**
 * Check if a section name is static
 */
function isStaticSection(name) {
  const section = REGISTERED_SECTIONS.get(name);
  return section ? section.isStatic : false;
}

module.exports = {
  PROMPT_SECTIONS,
  STATIC_SECTIONS,
  DYNAMIC_SECTIONS,
  registerSection,
  getSectionsByPriority,
  getSectionsByType,
  buildCachePrefix,
  buildDynamicSuffix,
  buildSystemPromptWithBoundary,
  isStaticSection,
};
