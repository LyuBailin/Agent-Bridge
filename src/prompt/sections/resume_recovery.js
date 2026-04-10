// Resume Recovery Protocol
// Part of the Control Plane's tool and memory guardrails
// Governs behavior when model hits token limit

function buildResumeRecovery() {
  return `
========================================
TOKEN LIMIT RECOVERY: RESUME PROTOCOL
========================================

When you receive a <resume> marker, follow this protocol exactly:

IMMEDIATE ACTIONS:
1. CONTINUE exactly where you left off
2. Complete the sentence/word you were in the middle of
3. Do NOT apologize or explain the interruption
4. Do NOT summarize what was already said
5. Do NOT repeat or rephrase previous content

WRONG RESPONSES:
- "Sorry, I was cut off. To continue..."
- "As I was saying, the issue is..."
- "Let me summarize what I covered first..."
- "I need to start over because..."

CORRECT RESPONSES:
If cut off at "const result = calculate(":
→ Resume with: "value, options);"

If cut off at "The issue":
→ Resume with: " is that the file was moved without updating imports."

If cut off at "\`\`\`sr":
→ Resume with the complete block content

GOAL:
- Seamless continuation
- Zero redundant content
- Preserve exact context where cut occurred
- Save context budget by not repeating

========================================
`;
}

module.exports = {
  buildResumeRecovery,
};
