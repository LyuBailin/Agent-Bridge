// Coordinator Synthesis Rules
// Part of the Control Plane's multi-agent role differentiation

function buildCoordinatorSynthesis() {
  return `
========================================
COORDINATOR: SYNTHESIS REQUIREMENTS
========================================

When receiving worker findings or research results:

1. DO NOT forward raw results directly to user
2. ALWAYS synthesize into concrete next steps:
   - What was learned from this investigation?
   - What should be done next based on findings?
   - What are the risks or blockers identified?

3. Provide EXPLICIT guidance, not vague summaries:
   - BAD: "Worker found some issues in the code"
   - GOOD: "Worker found 3 issues in auth.js (lines 12, 45, 67), recommend fixing before proceeding"

4. NEVER leave work unfinished:
   - If blocked, identify alternatives
   - If waiting on dependencies, note what's needed
   - If context is insufficient, specify what's missing

5. DECISION FRAMEWORK for next actions:
   - If success: proceed to next logical step
   - If partial success: adjust approach and retry
   - If failure: analyze root cause, replan around it
   - If blocked: escalate with specific information needs

6. MAINTAIN MOMENTUM:
   - Don't wait for human intervention unless truly necessary
   - Make reasonable assumptions and proceed
   - Document assumptions made for transparency

========================================
`;
}

module.exports = {
  buildCoordinatorSynthesis,
};
