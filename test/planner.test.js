const test = require("node:test");
const assert = require("node:assert/strict");

const planner = require("../src/core/planner");

function estTokens(text) {
  return Math.ceil(String(text ?? "").length / 4);
}

test("planner: evaluateComplexity maps score to difficulty via thresholds", () => {
  const instruction = "refactor a.txt and b.txt";
  const res = planner.evaluateComplexity(
    instruction,
    { likelyPaths: ["a.txt", "b.txt"], likelyPathCount: 2, existingLikelyFilesLineSum: 0 },
    { medium: 35, high: 70 }
  );
  assert.equal(res.difficulty, "medium");
  assert.ok(res.score >= 35 && res.score < 70);
  assert.deepEqual(res.likelyPaths, ["a.txt", "b.txt"]);
});

test("planner: optimizeContext trims for max_tokens and prioritizes likely paths", () => {
  const raw = [
    "Project Tree (2 files)",
    "- a.txt",
    "- b.txt",
    "",
    "FILE: a.txt",
    "1: aaa",
    "",
    "FILE: b.txt",
    "1: bbb",
    "",
    "GIT SUMMARY:",
    "Recent commits: (unavailable)"
  ].join("\n");

  const baseOnly = planner.optimizeContext("medium", raw, {
    max_tokens: estTokens("Project Tree (2 files)\n- a.txt\n- b.txt\n\nGIT SUMMARY:\nRecent commits: (unavailable)\n") + 2,
    likely_paths: []
  });
  assert.ok(baseOnly.includes("Project Tree"));
  assert.ok(baseOnly.includes("GIT SUMMARY:"));
  assert.ok(!baseOnly.includes("FILE: a.txt"));
  assert.ok(!baseOnly.includes("FILE: b.txt"));

  const wantA = planner.optimizeContext("medium", raw, {
    max_tokens: estTokens(raw) - 2,
    likely_paths: ["a.txt"]
  });
  assert.ok(wantA.includes("FILE: a.txt"));
});

test("planner: getNextExecutableSubtask respects dependencies and stable order", () => {
  const now = new Date().toISOString();
  const planTree = {
    schema_version: 1,
    task_id: "t",
    created_at: now,
    updated_at: now,
    replans: 0,
    order: ["s1", "s2", "s3"],
    nodes: {
      s1: {
        id: "s1",
        description: "first",
        target_files: [],
        dependencies: [],
        status: "done",
        attempts: 1,
        generator_provider: null,
        review_provider: null,
        started_at: null,
        finished_at: null,
        checkpoint_before_sha: null,
        checkpoint_commit_sha: null,
        raw_outputs: [],
        errors: []
      },
      s2: {
        id: "s2",
        description: "second depends s1",
        target_files: [],
        dependencies: ["s1"],
        status: "pending",
        attempts: 0,
        generator_provider: null,
        review_provider: null,
        started_at: null,
        finished_at: null,
        checkpoint_before_sha: null,
        checkpoint_commit_sha: null,
        raw_outputs: [],
        errors: []
      },
      s3: {
        id: "s3",
        description: "third depends s2",
        target_files: [],
        dependencies: ["s2"],
        status: "pending",
        attempts: 0,
        generator_provider: null,
        review_provider: null,
        started_at: null,
        finished_at: null,
        checkpoint_before_sha: null,
        checkpoint_commit_sha: null,
        raw_outputs: [],
        errors: []
      }
    },
    limits: { max_subtasks: 12, max_replans: 2 }
  };

  const s = planner.getNextExecutableSubtask(planTree);
  assert.equal(s.id, "s2");
});

test("planner: validatePlanTree rejects cycles", () => {
  const now = new Date().toISOString();
  const bad = {
    schema_version: 1,
    task_id: "t",
    created_at: now,
    updated_at: now,
    replans: 0,
    order: ["a", "b"],
    nodes: {
      a: {
        id: "a",
        description: "a",
        target_files: [],
        dependencies: ["b"],
        status: "pending",
        attempts: 0,
        generator_provider: null,
        review_provider: null,
        started_at: null,
        finished_at: null,
        checkpoint_before_sha: null,
        checkpoint_commit_sha: null,
        raw_outputs: [],
        errors: []
      },
      b: {
        id: "b",
        description: "b",
        target_files: [],
        dependencies: ["a"],
        status: "pending",
        attempts: 0,
        generator_provider: null,
        review_provider: null,
        started_at: null,
        finished_at: null,
        checkpoint_before_sha: null,
        checkpoint_commit_sha: null,
        raw_outputs: [],
        errors: []
      }
    },
    limits: { max_subtasks: 12, max_replans: 2 }
  };
  assert.throws(() => planner.validatePlanTree(bad), /cycle/i);
});
