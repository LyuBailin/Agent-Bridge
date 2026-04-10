# Iteration 4 - BUG-003: Semantic Review Response Malformation

## Bug Found: ensureReviewShape rejects valid responses

### Discovery
Phase 5 task (testing and documentation) failed at semantic_verify stage with error:
```
Invalid semantic review: missing boolean ok
```

### Root Cause
The Claude model (MiniMax) returned a malformed JSON response for semantic review:
```
result":"{\"type\":\"ok\":true,\"feedback_for_generator\":\"No issues found. The test f...
```

The model produced `{"type":"ok":true,...}` instead of `{"ok":true,...}` - it added an extra `type` key wrapping the `ok` value.

### Detection
The model returned `{"type":"ok","ok":true,...}` or similar malformed structure that fails `typeof json.ok !== "boolean"` check.

### Modified Files
- `src/core/verifier.js`: Enhanced `ensureReviewShape` function with better malformation detection:
  - Added diagnostic message showing actual response keys
  - Detects common cases where model puts `ok` as string value of `type` key
  - Improved error messages for debugging

### Test Results
- npm test: 401 tests passed

### Root Cause Analysis
The 14b model (qwen-2.5-coder:14b) cannot reliably produce exact JSON format required by semantic_verify. This is a fundamental model capability issue, not a code bug. Semantic verification tasks require exact JSON schema output which smaller models cannot consistently produce.

### Recommendation
For tasks requiring semantic_verify (medium/high difficulty), use a more capable model or disable semantic verification and rely only on syntax checks.