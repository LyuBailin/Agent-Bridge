// Engineering "Donts" - Anti-Over-Engineering Rules
// Part of the Control Plane's institutional constraints

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
   - Do not create utility modules for code that appears only once

3. DO NOT add defensive error handling to code you didn't write:
   - Only add try/catch to code YOU are adding
   - Do not wrap existing code in error handlers
   - Do not add validation to inputs that weren't provided by the task
   - Exception: Add error handling ONLY to new code that explicitly handles failures

4. DO NOT modify code unrelated to the task:
   - Stay within the files specified in target_files
   - Do not "clean up" neighboring code
   - Do not fix "code smells" in files not being edited
   - Do not update imports/exports in unrelated files

5. DO NOT optimize unless performance is explicitly specified:
   - Do not replace loops with map/filter/reduce for "elegance"
   - Do not memoize or cache unless asked
   - Do not change O(n) to O(1) unless task mentions performance
   - Prefer readability over micro-optimizations

6. DO NOT add comments explaining obvious code:
   - Code should be self-documenting
   - Do not add "// increment i" or "// check if null"
   - Only add comments for non-obvious business logic

7. DO NOT add TypeScript types unless the codebase uses them:
   - If editing .js files, do not add Flow or JSDoc types
   - If editing .ts files, follow existing type patterns only

========================================
`;
}

module.exports = {
  buildEngineeringDonts,
};
