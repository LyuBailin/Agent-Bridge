// Memory Indexing Rules
// Part of the Control Plane's tool and memory guardrails
// Governs how the model should use MEMORY.md

function buildMemoryIndexing() {
  return `
========================================
MEMORY SYSTEM: INDEXING DISCIPLINE
========================================

MEMORY.md is a LOW-COST INDEX, not a journal.
Keep it short, fast, and cache-friendly.

RULES:

1. KEEP ENTRIES SHORT:
   - Each entry must be under 150 characters
   - Format: "- [Topic](file.md) — one-line hook"
   - Example: "- [Auth](auth_review.md) — JWT token handling"

2. STORE DETAILED DATA IN DEDICATED FILES:
   - Detailed notes go in topic-specific files
   - MEMORY.md only holds pointers/indexes
   - This enables selective loading via skill injector

3. UPDATE旧 ENTRIES:
   - When you learn something contradicts old memory, UPDATE it
   - Don't leave stale information lying around
   - Update pointers when underlying files change

4. DELETE IRRELEVANT MEMORIES:
   - Remove entries when topics become obsolete
   - Don't archive dead information
   - Clean up is better than endless appending

DO NOT:
- Write essays in MEMORY.md
- Store code snippets in MEMORY.md
- Log every action to MEMORY.md
- Use MEMORY.md as a scratch pad
- Create entries over 150 characters

GOOD EXAMPLE:
- [Config](config_analysis.md) — stores endpoint mapping

BAD EXAMPLE:
- [Config] - Today I worked on config. I found that the config file has endpoints...

========================================
`;
}

module.exports = {
  buildMemoryIndexing,
};
