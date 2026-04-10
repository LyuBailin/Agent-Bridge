const test = require("node:test");
const assert = require("node:assert/strict");

const planner = require("../../../src/core/planner");

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

// --- analyzeDifficulty ---

test("planner: analyzeDifficulty keywords", () => {
  assert.equal(planner.analyzeDifficulty("refactor the module"), "high");
  assert.equal(planner.analyzeDifficulty("migrate the database"), "high");
  assert.equal(planner.analyzeDifficulty("架构调整"), "high");
  assert.equal(planner.analyzeDifficulty("write tests for login"), "high");
});

test("planner: analyzeDifficulty path count", () => {
  // 3+ likely paths → high
  assert.equal(planner.analyzeDifficulty("edit a.txt b.txt c.txt"), "high");
  // 2 likely paths → medium
  assert.equal(planner.analyzeDifficulty("edit a.txt b.txt"), "medium");
  // 1 likely path → low (no keywords)
  assert.equal(planner.analyzeDifficulty("update a.txt"), "low");
});

test("planner: analyzeDifficulty plain instructions → low", () => {
  assert.equal(planner.analyzeDifficulty("hello world"), "low");
  assert.equal(planner.analyzeDifficulty("do something"), "low");
});

// --- extractLikelyPaths ---

test("planner: extractLikelyPaths extracts dot-ext paths", () => {
  const paths = planner.extractLikelyPaths("update src/app.js and lib/utils.js");
  assert.ok(paths.includes("src/app.js") || paths.includes("app.js"));
});

test("planner: extractLikelyPaths extracts quoted paths", () => {
  const paths = planner.extractLikelyPaths("edit \"foo/bar.js\"");
  assert.ok(paths.includes("foo/bar.js"));
});

test("planner: extractLikelyPaths skips .. escape", () => {
  const paths = planner.extractLikelyPaths("../etc/passwd");
  assert.ok(!paths.some((p) => p.includes("..")));
});

test("planner: extractLikelyPaths ignores paths with ..", () => {
  const paths = planner.extractLikelyPaths("edit a.txt and ../b.txt");
  assert.ok(!paths.some((p) => p.includes("..")));
});

// --- buildSingleNodePlanTree ---

test("planner: buildSingleNodePlanTree creates single-node tree", () => {
  const tree = planner.buildSingleNodePlanTree("t1", "do the thing", ["a.js"], { max_subtasks: 12, max_replans: 2 });
  assert.equal(tree.task_id, "t1");
  assert.deepEqual(tree.order, ["s1"]);
  assert.equal(tree.nodes.s1.description, "do the thing");
  assert.deepEqual(tree.nodes.s1.target_files, ["a.js"]);
  assert.deepEqual(tree.nodes.s1.dependencies, []);
  assert.equal(tree.nodes.s1.status, "pending");
});

test("planner: buildSingleNodePlanTree rejects unsafe target files", () => {
  const tree = planner.buildSingleNodePlanTree("t1", "do the thing", ["/etc/passwd", "a.js"]);
  // unsafe paths are filtered out
  assert.ok(!tree.nodes.s1.target_files.includes("/etc/passwd"));
  assert.ok(tree.nodes.s1.target_files.includes("a.js"));
});

test("planner: buildSingleNodePlanTree respects limits", () => {
  const tree = planner.buildSingleNodePlanTree("t1", "do", [], { max_subtasks: 5, max_replans: 1 });
  assert.equal(tree.limits.max_subtasks, 5);
  assert.equal(tree.limits.max_replans, 1);
});

// --- updatePlanState ---

test("planner: updatePlanState updates status", () => {
  const tree = planner.buildSingleNodePlanTree("t1", "do", ["a.js"]);
  const next = planner.updatePlanState(tree, "s1", { status: "done" });
  assert.equal(next.nodes.s1.status, "done");
});

test("planner: updatePlanState increments attempts_delta", () => {
  const tree = planner.buildSingleNodePlanTree("t1", "do", ["a.js"]);
  const next = planner.updatePlanState(tree, "s1", { attempts_delta: 1 });
  assert.equal(next.nodes.s1.attempts, 1);
  const next2 = planner.updatePlanState(next, "s1", { attempts_delta: 1 });
  assert.equal(next2.nodes.s1.attempts, 2);
});

test("planner: updatePlanState updates providers", () => {
  const tree = planner.buildSingleNodePlanTree("t1", "do", ["a.js"]);
  const next = planner.updatePlanState(tree, "s1", { providers: { generator_provider: "claude_cli" } });
  assert.equal(next.nodes.s1.generator_provider, "claude_cli");
});

test("planner: updatePlanState appends errors", () => {
  const tree = planner.buildSingleNodePlanTree("t1", "do", ["a.js"]);
  const err = { stage: "apply", message: "failed" };
  const next = planner.updatePlanState(tree, "s1", { errors: [err] });
  assert.equal(next.nodes.s1.errors.length, 1);
  assert.equal(next.nodes.s1.errors[0].message, "failed");
});

test("planner: updatePlanState throws on unknown subtaskId", () => {
  const tree = planner.buildSingleNodePlanTree("t1", "do", ["a.js"]);
  assert.throws(() => planner.updatePlanState(tree, "s99", { status: "done" }), /Unknown subtaskId/);
});

// --- validatePlanTree structural ---

test("planner: validatePlanTree rejects non-object", () => {
  assert.throws(() => planner.validatePlanTree(null), /must be an object/);
  assert.throws(() => planner.validatePlanTree("string"), /must be an object/);
});

test("planner: validatePlanTree rejects wrong schema_version", () => {
  const now = new Date().toISOString();
  const t = { schema_version: 99, task_id: "t", created_at: now, updated_at: now, replans: 0, order: ["s1"], nodes: { s1: { id: "s1", description: "a", target_files: [], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] } }, limits: { max_subtasks: 12, max_replans: 2 } };
  assert.throws(() => planner.validatePlanTree(t), /schema_version must be 1/);
});

test("planner: validatePlanTree rejects empty order", () => {
  const now = new Date().toISOString();
  const t = { schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0, order: [], nodes: { s1: { id: "s1", description: "a", target_files: [], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] } }, limits: { max_subtasks: 12, max_replans: 2 } };
  assert.throws(() => planner.validatePlanTree(t), /non-empty array/);
});

test("planner: validatePlanTree rejects order with unknown id", () => {
  const now = new Date().toISOString();
  const t = { schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0, order: ["s1", "s99"], nodes: { s1: { id: "s1", description: "a", target_files: [], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] } }, limits: { max_subtasks: 12, max_replans: 2 } };
  assert.throws(() => planner.validatePlanTree(t), /unknown id/);
});

test("planner: validatePlanTree rejects duplicate id in order", () => {
  const now = new Date().toISOString();
  const t = { schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0, order: ["s1", "s1"], nodes: { s1: { id: "s1", description: "a", target_files: [], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] } }, limits: { max_subtasks: 12, max_replans: 2 } };
  assert.throws(() => planner.validatePlanTree(t), /duplicate/);
});

test("planner: validatePlanTree rejects node id mismatch", () => {
  const now = new Date().toISOString();
  const nodes = { s1: { id: "s2", description: "a", target_files: [], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] } };
  const t = { schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0, order: ["s1"], nodes, limits: { max_subtasks: 12, max_replans: 2 } };
  assert.throws(() => planner.validatePlanTree(t), /id mismatch/);
});

test("planner: validatePlanTree rejects empty description", () => {
  const now = new Date().toISOString();
  const nodes = { s1: { id: "s1", description: "   ", target_files: [], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] } };
  const t = { schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0, order: ["s1"], nodes, limits: { max_subtasks: 12, max_replans: 2 } };
  assert.throws(() => planner.validatePlanTree(t), /missing description/);
});

test("planner: validatePlanTree rejects dependency on missing node", () => {
  const now = new Date().toISOString();
  const nodes = { s1: { id: "s1", description: "a", target_files: [], dependencies: ["s99"], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] } };
  const t = { schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0, order: ["s1"], nodes, limits: { max_subtasks: 12, max_replans: 2 } };
  assert.throws(() => planner.validatePlanTree(t), /missing node/);
});

test("planner: validatePlanTree rejects unsafe target file", () => {
  const now = new Date().toISOString();
  const nodes = { s1: { id: "s1", description: "a", target_files: ["/etc/passwd"], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] } };
  const t = { schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0, order: ["s1"], nodes, limits: { max_subtasks: 12, max_replans: 2 } };
  assert.throws(() => planner.validatePlanTree(t), /Unsafe/);
});

// --- getNextExecutableSubtask ---

test("planner: getNextExecutableSubtask returns null when all done", () => {
  const now = new Date().toISOString();
  const tree = {
    schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0,
    order: ["s1"],
    nodes: {
      s1: { id: "s1", description: "a", target_files: [], dependencies: [], status: "done", attempts: 1, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] }
    },
    limits: { max_subtasks: 12, max_replans: 2 }
  };
  assert.equal(planner.getNextExecutableSubtask(tree), null);
});

test("planner: getNextExecutableSubtask skips running", () => {
  const now = new Date().toISOString();
  const tree = {
    schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0,
    order: ["s1", "s2"],
    nodes: {
      s1: { id: "s1", description: "a", target_files: [], dependencies: [], status: "running", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] },
      s2: { id: "s2", description: "b", target_files: [], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] }
    },
    limits: { max_subtasks: 12, max_replans: 2 }
  };
  // s1 is running (not pending), so s2 should be returned
  const next = planner.getNextExecutableSubtask(tree);
  assert.equal(next.id, "s2");
});

test("planner: getNextExecutableSubtask respects dependencies", () => {
  const now = new Date().toISOString();
  const tree = {
    schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0,
    order: ["s1", "s2"],
    nodes: {
      s1: { id: "s1", description: "a", target_files: [], dependencies: [], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] },
      s2: { id: "s2", description: "b", target_files: [], dependencies: ["s1"], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] }
    },
    limits: { max_subtasks: 12, max_replans: 2 }
  };
  assert.equal(planner.getNextExecutableSubtask(tree).id, "s1"); // s1 has no deps, s2 depends on s1
});

test("planner: getNextExecutableSubtask satisfies 'skipped' as dependency-satisfied", () => {
  const now = new Date().toISOString();
  const tree = {
    schema_version: 1, task_id: "t", created_at: now, updated_at: now, replans: 0,
    order: ["s1", "s2"],
    nodes: {
      s1: { id: "s1", description: "a", target_files: [], dependencies: [], status: "skipped", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] },
      s2: { id: "s2", description: "b", target_files: [], dependencies: ["s1"], status: "pending", attempts: 0, generator_provider: null, review_provider: null, started_at: null, finished_at: null, checkpoint_before_sha: null, checkpoint_commit_sha: null, raw_outputs: [], errors: [] }
    },
    limits: { max_subtasks: 12, max_replans: 2 }
  };
  assert.equal(planner.getNextExecutableSubtask(tree).id, "s2");
});

// --- optimizeContext ---

test("planner: optimizeContext no-ops when no max_tokens", () => {
  const out = planner.optimizeContext("medium", "some text", {});
  assert.equal(out, "some text");
});

test("planner: optimizeContext no-ops when max_tokens negative", () => {
  const out = planner.optimizeContext("medium", "some text", { max_tokens: -1 });
  assert.equal(out, "some text");
});

test("planner: optimizeContext preserves GIT SUMMARY even when trimming", () => {
  const raw = "FILE: a.txt\ncontent\n\nGIT SUMMARY:\nRecent commits:\n- abc def";
  const out = planner.optimizeContext("medium", raw, { max_tokens: 10, likely_paths: [] });
  assert.ok(out.includes("GIT SUMMARY:"));
});

test("planner: optimizeContext prioritizes likely_paths files", () => {
  const raw = "FILE: a.txt\ncontent-a\n\nFILE: b.txt\ncontent-b\n\nGIT SUMMARY:";
  const out = planner.optimizeContext("medium", raw, { max_tokens: 9999, likely_paths: ["a.txt"] });
  assert.ok(out.includes("FILE: a.txt"));
});
