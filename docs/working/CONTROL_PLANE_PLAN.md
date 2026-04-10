# Control Plane / Prompt Engineering Implementation Plan

> Created: 2026-04-07
> Status: Implementation Complete
> Focus: Transform prompts from "personas" into a regulatory framework ("constitution")

**Related Plans:**
- `TOOL_GOVERNANCE_PLAN.md` - Tool-level governance (complete)
- `QUERY_LOOP_PLAN.md` - Query orchestration (complete)
- This plan: **Prompt-level governance** - execution boundaries, behavioral constraints, role differentiation

---

## Context

The existing `src/prompt/` modules provide modular prompt building but lack:
- Priority hierarchy for override behavior
- Cache optimization via prefix-loading
- Institutional "engineering constraints" (anti-over-engineering rules)
- Adversarial verification stance
- Action sequence enforcement (read before edit)
- Multi-role prompt differentiation (planner vs executor vs verifier)
- High-density constraints for high-risk tools
- Memory indexing discipline

This plan transforms the prompt system into a **Control Plane** with regulatory framework semantics.

---

## Module 1: Structural Architecture (Tiered System Prompt)

### Goal
Replace flat prompts with a **prioritized section-based architecture** where explicit overrides can replace defaults without breaking the system.

### 1.1 Section-Based Assembly

Current `buildSystemPrompt()` concatenates modules. Proposed structure:

```javascript
// src/prompt/registry.js - NEW
const PROMPT_SECTIONS = {
  // Highest priority - loaded last (overrides everything)
  OVERRIDE: 'override',

  // Coordinator-level rules (for multi-subtask orchestration)
  COORDINATOR: 'coordinator',

  // Agent-level rules (default agent behavior)
  AGENT: 'agent',

  // Custom/user-provided rules
  CUSTOM: 'custom',

  // Lowest priority - loaded first (defaults)
  DEFAULT: 'default'
};

// Section loading order: DEFAULT → CUSTOM → AGENT → COORDINATOR → OVERRIDE
// Later sections can override earlier ones
```

### 1.2 Prompt Section Definitions

```javascript
// src/prompt/sections/identity.js
const SECTION_IDENTITY = {
  priority: PROMPT_SECTIONS.DEFAULT,
  static: true,  // Cacheable - doesn't change per session
  content: [
    "You are a professional code editing agent...",
    // Current identity content
  ]
};

// src/prompt/sections/override.js - NEW
const SECTION_OVERRIDE = {
  priority: PROMPT_SECTIONS.OVERRIDE,
  static: false,  // Dynamic per session
  content: []  // Populated at runtime for special instructions
};
```

### 1.3 Dynamic Boundary Marker

```javascript
// In buildSystemPrompt(), insert boundary between static and dynamic:
function buildSystemPrompt(context = {}) {
  const staticSections = [SECTIONS.IDENTITY, SECTIONS.SYSTEM_RULES, ...];
  const dynamicSections = [SECTIONS.OVERRIDE, SECTIONS.SESSION_CONTEXT];

  return [
    ...staticSections.map(s => s.content.join("\n")),
    "<!-- SYSTEM_PROMPT_DYNAMIC_BOUNDARY -->",
    ...dynamicSections.map(s => s.content.join("\n"))
  ].join("\n");
}
```

### Files to Modify/Create

| File | Action |
|------|--------|
| `src/prompt/registry.js` | **NEW** - Section priority registry |
| `src/prompt/sections/` | **NEW** - Directory for section definitions |
| `src/prompt/sections/identity.js` | Refactor with SECTION metadata |
| `src/prompt/sections/system_rules.js` | Refactor with SECTION metadata |
| `src/prompt/sections/engineering_donts.js` | **NEW** - Anti-over-engineering rules |
| `src/prompt/sections/verification_skepticism.js` | **NEW** - Adversarial verification rules |
| `src/prompt/sections/action_sequence.js` | **NEW** - Read-before-edit enforcement |
| `src/prompt/index.js` | Update to use section-based assembly |

---

## Module 2: Context Economics & Cache Optimization

### Goal
Maximize prompt caching efficiency by structuring content for API prefix-cache hits.

### 2.1 Prefix-Loading Strategy

```javascript
// Most stable, immutable content at the BEGINNING
// Changes here invalidate entire cache
const CACHE_PREFIX = [
  buildIdentitySection(),       // Rarely changes
  buildSystemRulesSection(),     // Security constraints - stable
  buildToolSchemaSection(),      // Tool definitions - stable
  buildOperationGuidelines(),    // Block syntax - stable
];

// Dynamic content at the END (doesn't break cache on change)
const DYNAMIC_SUFFIX = [
  buildSessionContext(),        // Task-specific - changes per call
  buildSkillInjections(),        // Only when triggered
  buildMemoryIndex(),            // Short pointers to detailed docs
];
```

### 2.2 Dynamic Skill Injection

Current: All skills/instructions included in every prompt.
Proposed: Inject only when triggered.

```javascript
// src/prompt/skill_injector.js - NEW
const REGISTERED_SKILLS = {
  'git-management': loadSkill('skills/git_management.md'),
  'regex-expert': loadSkill('skills/regex_expert.md'),
  // Skills loaded on-demand, not preloaded
};

function buildSkillPrompt(skillNames = []) {
  return skillNames
    .filter(name => REGISTERED_SKILLS[name])
    .map(name => REGISTERED_SKILLS[name])
    .join("\n\n");
}

// Usage: Only inject when task explicitly references a skill
```

### 2.3 Cache-Safe Forking for Sub-Agents

When spawning sub-agents (planner, verifier), inherit exact parent prefix:

```javascript
// In adapter/providers/claude_cli.js or planner.js
function forkForSubAgent(parentSystemPrompt) {
  return {
    // Exact copy of parent's prefix for cache hit
    inheritedPrefix: parentSystemPrompt.split('<!-- SYSTEM_PROMPT_DYNAMIC_BOUNDARY -->')[0],
    // Sub-agent specific dynamic content appended
  };
}
```

### Files to Modify/Create

| File | Action |
|------|--------|
| `src/prompt/cache_strategy.js` | **NEW** - Prefix/suffix organization |
| `src/prompt/skill_injector.js` | **NEW** - On-demand skill loading |
| `src/prompt/index.js` | Integrate cache strategy |
| `src/core/planner.js` | Use cache-safe forking |

---

## Module 3: Behavioral Governance (Engineering Constraints)

### Goal
Treat the model as an "unstable component" requiring strict institutional rules, not "smart suggestions."

### 3.1 Engineering "Don'ts" (Anti-Over-Engineering)

```javascript
// src/prompt/sections/engineering_donts.js - NEW
function buildEngineeringDonts() {
  return `
========================================
INSTITUTIONAL ENGINEERING CONSTRAINTS
========================================

You are PROHIBITED from the following:

1. DO NOT add unrequested features:
   - Only implement what the task specifies
   - Do not add logging, metrics, or "goodies" unless asked
   - Do not create helper functions not directly needed

2. DO NOT create premature abstractions:
   - Do not refactor working code
   - Do not introduce interfaces/base classes for hypothetical reuse
   - Do not extract "common utilities" from single use cases

3. DO NOT add defensive error handling to code you didn't write:
   - Only add try/catch to code YOU are adding
   - Do not wrap existing code in error handlers
   - Do not add validation to inputs that weren't provided by the task

4. DO NOT modify code unrelated to the task:
   - Stay within the files specified in target_files
   - Do not "clean up" neighboring code

5. DO NOT optimize unless performance is explicitly specified:
   - Do not replace loops with map/filter/reduce
   - Do not memoize or cache unless asked
   - Prefer readability over micro-optimizations

========================================
`;
}
```

### 3.2 Verification Skepticism (Adversarial Stance)

```javascript
// src/prompt/sections/verification_skepticism.js - NEW
function buildVerificationSkepticism() {
  return `
========================================
VERIFICATION AGENT: ADVERSARIAL STANCE
========================================

You are a skeptical code reviewer. Your job is to find problems,
not approve work that "looks right."

CRITICAL RULES:

1. DO NOT accept "looks correct" as proof:
   - Require evidence of actual execution
   - Ask: "Has this been tested with actual inputs?"
   - Ask: "What happens at edge cases?"

2. IDENTIFY verification avoidance patterns:
   - "The code is straightforward" = no proof
   - "This should work" = no proof
   - "I didn't change much" = irrelevant
   - "It's obvious" = no proof

3. DEMAND independent validation:
   - Run syntax checks (node --check, json parse)
   - Verify file paths actually exist
   - Confirm SEARCH patterns match actual file content
   - Check that mv/rm targets are valid before the operation

4. REJECT if:
   - SEARCH patterns don't match exactly
   - Paths are outside workspace
   - Syntax errors exist
   - Logic doesn't match task requirements

========================================
`;
}
```

### 3.3 Action Sequence Enforcement

```javascript
// src/prompt/sections/action_sequence.js - NEW
function buildActionSequence() {
  return `
========================================
MANDATORY ACTION SEQUENCE
========================================

BEFORE editing any file:
1. READ the file completely
2. LOCATE the exact text to modify
3. CONFIRM search pattern matches
4. THEN apply the replacement

BEFORE retrying a failed operation:
1. DIAGNOSE the actual failure reason
2. Identify what changed (did file get modified?)
3. Do NOT blindly retry the same approach
4. Suggest an alternative strategy

NEVER:
- Edit a file you haven't read
- Retry without understanding why it failed
- Skip diagnostic steps when stuck

========================================
`;
}
```

### Files to Create

| File | Action |
|------|--------|
| `src/prompt/sections/engineering_donts.js` | **NEW** - Anti-over-engineering rules |
| `src/prompt/sections/verification_skepticism.js` | **NEW** - Adversarial verification |
| `src/prompt/sections/action_sequence.js` | **NEW** - Read-before-edit enforcement |
| `src/prompt/index.js` | Add new sections to system prompt |

---

## Module 4: Multi-Agent Role Differentiation

### Goal
Create distinct prompt personas that prevent context pollution from conflicting reasoning.

### 4.1 Role-Specific Prompt Factories

Current: Same system prompt for all agents.
Proposed: Role-specific prompts with inheritance.

```javascript
// src/prompt/roles/implementation.js
const ImplementationRole = {
  name: 'implementation',
  inherits: ['default', 'agent'],  // Base sections to include
  sections: [
    require('./sections/engineering_donts'),
    require('./sections/action_sequence')
  ]
};

// src/prompt/roles/verification.js
const VerificationRole = {
  name: 'verification',
  inherits: ['default', 'agent'],
  sections: [
    require('./sections/verification_skepticism')
  ]
};

// src/prompt/roles/planning.js
const PlanningRole = {
  name: 'planning',
  inherits: ['default', 'coordinator'],
  sections: [
    require('./sections/planning_guidelines')
  ]
};

// src/prompt/roles/readonly_explore.js - NEW
const ReadOnlyExploreRole = {
  name: 'readonly_explore',
  inherits: ['default'],
  // EXPLICITLY REMOVE destructive tools
  removedTools: ['search_replace', 'mkdir', 'mv', 'rm'],
  sections: [
    require('./sections/readonly_boundaries')
  ]
};
```

### 4.2 Read-Only Expert Role

```javascript
// src/prompt/sections/readonly_boundaries.js - NEW
function buildReadOnlyBoundaries() {
  return `
========================================
READ-ONLY EXPLORATION AGENT
========================================

You are a research agent with STRICT READ-ONLY access.

ALLOWED OPERATIONS:
- Read files (via context collection)
- Search for patterns
- Analyze code structure
- Map dependencies

PROHIBITED OPERATIONS:
- NO file edits of any kind
- NO directory creation
- NO file moves or deletions
- NO system state changes
- NO git operations

Your output is analysis and findings, not code changes.

========================================
`;
}
```

### 4.3 Coordinator Synthesis Rules

```javascript
// src/prompt/sections/coordinator_synthesis.js - NEW
function buildCoordinatorSynthesis() {
  return `
========================================
COORDINATOR: SYNTHESIS REQUIREMENTS
========================================

When receiving worker findings:

1. DO NOT forward raw results to user
2. ALWAYS synthesize into concrete next steps:
   - What was learned?
   - What should be done next?
   - What are the risks?

3. Provide EXPLICIT guidance:
   - Not "Worker found issues" but "Worker found X, recommend Y"

4. Keep the conversation moving:
   - If blocked, identify alternatives
   - Don't wait for human intervention unless necessary

========================================
`;
}
```

### Files to Modify/Create

| File | Action |
|------|--------|
| `src/prompt/roles/` | **NEW** - Role definitions directory |
| `src/prompt/roles/implementation.js` | **NEW** - Implementation agent role |
| `src/prompt/roles/verification.js` | **NEW** - Verification agent role |
| `src/prompt/roles/planning.js` | **NEW** - Planning agent role |
| `src/prompt/roles/readonly_explore.js` | **NEW** - Read-only explore role |
| `src/prompt/sections/coordinator_synthesis.js` | **NEW** - Synthesis rules |
| `src/prompt/sections/readonly_boundaries.js` | **NEW** - Read-only restrictions |
| `src/prompt/role_factory.js` | **NEW** - Build prompts by role |

---

## Module 5: Tool & Memory Guardrails

### Goal
Govern high-risk tool interactions and enforce memory discipline.

### 5.1 High-Density Constraints for Bash (If Ever Enabled)

Document already exists in `TOOL_GOVERNANCE_PLAN.md` Module 6. This plan formalizes it in prompts:

```javascript
// src/prompt/sections/bash_constraints.js - NEW
function buildBashConstraints() {
  return `
========================================
BASH: RULES OF ENGAGEMENT (IF ENABLED)
========================================

GIT OPERATIONS:
- NEVER force push (--force is denied)
- NEVER bypass git hooks (--no-verify is denied)
- NEVER run interactive git commands

PERMISSIONS:
- Never modify file permissions (chmod, chown)
- Never access credentials or secrets
- Never create or modify service accounts

ENVIRONMENT:
- PATH restricted to /usr/local/bin:/usr/bin
- HOME set to /tmp
- No network access except required APIs

PIPE SAFETY:
- Never pipe to shell (| bash, | sh)
- Never use command substitution with user input

INTERACTIVE:
- Never use -y, -i, --interactive flags
- Never auto-confirm prompts

========================================
If Bash is denied (DENIED_OPERATIONS), ignore this section.
========================================
`;
}
```

### 5.2 Memory Indexing Discipline

```javascript
// src/prompt/sections/memory_indexing.js - NEW
function buildMemoryIndexing() {
  return `
========================================
MEMORY SYSTEM: INDEXING RULES
========================================

MEMORY.md is a LOW-COST INDEX, not a journal.

RULES:
1. Keep MEMORY.md entries SHORT (<150 chars each)
2. Store detailed data in dedicated files
3. Use the format: "- [Topic](file.md) — one-line hook"
4. Update outdated memories when you find new information
5. Delete memories that become irrelevant

DO NOT:
- Write essays in MEMORY.md
- Store code snippets in MEMORY.md
- Log every action to MEMORY.md

EXAMPLE:
GOOD: "- [Auth middleware](auth_middleware.md) — stores token handling logic"
BAD: "- [Auth] - Today I worked on auth middleware. I fixed a bug where..."

========================================
`;
}
```

### 5.3 Resume-Centric Recovery

```javascript
// src/prompt/sections/resume_recovery.js - NEW
function buildResumeRecovery() {
  return `
========================================
TOKEN LIMIT RECOVERY: RESUME PROTOCOL
========================================

When you receive <resume> marker:

1. CONTINUE exactly where you left off
2. Do NOT apologize or explain the interruption
3. Do NOT summarize what was already said
4. Do NOT repeat or rephrase previous content
5. Complete the sentence/word you were in the middle of

EXAMPLE:
If cut off at "const result = calculate(":
→ Resume with "value, options);"

If cut off at "The issue is":
→ Resume with " that the file was moved without updating imports."

WRONG:
- "Sorry, I was cut off. To continue..."
- "As I was saying, the issue is..."
- "Let me summarize what I covered..."

========================================
`;
}
```

### Files to Create

| File | Action |
|------|--------|
| `src/prompt/sections/bash_constraints.js` | **NEW** - Bash rules of engagement |
| `src/prompt/sections/memory_indexing.js` | **NEW** - Memory discipline |
| `src/prompt/sections/resume_recovery.js` | **NEW** - Resume protocol |
| `src/prompt/index.js` | Add sections to appropriate prompts |

---

## Implementation Order

| Phase | Module | Priority | Dependencies | Status |
|-------|--------|----------|--------------|--------|
| 1 | Module 1: Section Registry | High | None | Pending |
| 2 | Module 1: Section Refactoring | High | Phase 1 | Pending |
| 3 | Module 3: Engineering Donts | High | Phase 1 | Pending |
| 4 | Module 3: Action Sequence | High | Phase 1 | Pending |
| 5 | Module 2: Cache Strategy | Medium | Phase 1 | Pending |
| 6 | Module 4: Role Factory | Medium | Phase 1-3 | Pending |
| 7 | Module 3: Verification Skepticism | Medium | Phase 1 | Pending |
| 8 | Module 5: Memory Indexing | Medium | Phase 1 | Pending |
| 9 | Module 5: Resume Recovery | Medium | Phase 1 | Pending |
| 10 | Module 4: Role Definitions | Medium | Phase 6 | Pending |
| 11 | Module 5: Bash Constraints | Low | Phase 1 | Pending |

---

## File Manifest

### New Files

| Path | Description |
|------|-------------|
| `src/prompt/registry.js` | Section priority registry |
| `src/prompt/sections/` | Section definitions directory |
| `src/prompt/sections/engineering_donts.js` | Anti-over-engineering rules |
| `src/prompt/sections/verification_skepticism.js` | Adversarial verification rules |
| `src/prompt/sections/action_sequence.js` | Read-before-edit enforcement |
| `src/prompt/sections/readonly_boundaries.js` | Read-only exploration restrictions |
| `src/prompt/sections/coordinator_synthesis.js` | Coordinator synthesis requirements |
| `src/prompt/sections/bash_constraints.js` | Bash rules of engagement |
| `src/prompt/sections/memory_indexing.js` | Memory discipline rules |
| `src/prompt/sections/resume_recovery.js` | Resume protocol |
| `src/prompt/cache_strategy.js` | Cache optimization logic |
| `src/prompt/skill_injector.js` | On-demand skill loading |
| `src/prompt/role_factory.js` | Role-based prompt factory |
| `src/prompt/roles/` | Role definitions directory |
| `src/prompt/roles/implementation.js` | Implementation agent role |
| `src/prompt/roles/verification.js` | Verification agent role |
| `src/prompt/roles/planning.js` | Planning agent role |
| `src/prompt/roles/readonly_explore.js` | Read-only explore role |

### Modified Files

| Path | Changes |
|------|---------|
| `src/prompt/index.js` | Section-based assembly, cache strategy integration |
| `src/prompt/identity.js` | Add section metadata |
| `src/prompt/system_rules.js` | Add section metadata |
| `src/prompt/operation_guidelines.js` | Add section metadata |
| `src/prompt/output_discipline.js` | Add section metadata |
| `src/prompt/feedback.js` | May need role-specific variants |
| `src/prompt/plan.js` | Use role factory |
| `src/core/planner.js` | Use cache-safe forking |
| `src/core/adapter/parser.js` | Role-based prompt loading |

---

## Risk Assessment

| Change | Risk | Mitigation |
|--------|------|------------|
| Section-based assembly | Medium | Feature flag to disable, backward compatible |
| Engineering "Donts" | Low | Additive rules, doesn't remove existing behavior |
| Verification Skepticism | Low | Only applies to verification role, not default |
| Cache optimization | Medium | Verify cache hits improve latency |
| Role differentiation | Medium | Backward compatible - same output format |
| Memory indexing | Low | Doesn't change functional behavior |
| Resume recovery | Low | Only triggers on token limit |

---

## Testing Checklist

- [ ] Section registry loads in correct priority order
- [ ] Override section can replace default content
- [ ] Static sections separated from dynamic via boundary marker
- [ ] Engineering "Donts" rules prevent over-engineering in responses
- [ ] Action sequence rules enforce read-before-edit
- [ ] Verification role adopts adversarial stance
- [ ] Read-only explore role cannot issue write operations
- [ ] Coordinator synthesizes findings (not just forwards)
- [ ] Memory indexing rules applied to MEMORY.md operations
- [ ] Resume protocol triggers on token limit
- [ ] Cache prefix stays stable across sessions
- [ ] Dynamic skills only load when referenced
- [ ] All existing tests still pass
