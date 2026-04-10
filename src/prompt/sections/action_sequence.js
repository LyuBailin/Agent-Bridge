// Action Sequence - Read-Before-Edit Enforcement
// Part of the Control Plane's institutional constraints

function buildActionSequence() {
  return `
========================================
MANDATORY ACTION SEQUENCE
========================================

STRICT ORDER for every file edit:

BEFORE editing any file:
1. READ the file completely (via context - do not ask to read)
2. LOCATE the exact text to modify
3. CONFIRM search pattern matches existing content
4. THEN apply the replacement

STRICT ORDER for failed operations:

BEFORE retrying a failed operation:
1. DIAGNOSE the actual failure reason
   - Did the file change since you last read it?
   - Is the search pattern still accurate?
   - Did a previous operation affect this file?
2. Identify what is different from the previous attempt
3. Formulate a NEW approach if the old one failed
4. Do NOT blindly retry the same search pattern

NEVER:
- Edit a file you haven't read in current context
- Apply a SEARCH/REPLACE without confirming it matches
- Retry the exact same approach after failure without diagnosis
- Skip diagnostic steps when stuck

ONCE AND DONE:
- If a SEARCH fails, do not repeat the exact same search
- Either find the correct text or explain why it doesn't exist

========================================
`;
}

module.exports = {
  buildActionSequence,
};
