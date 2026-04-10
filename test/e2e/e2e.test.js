const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");
const { spawn } = require("node:child_process");

const gitManager = require("../../src/core/git_manager");

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_e2e_"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function runOnce(rootDir, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "..", "..", "src", "core", "main.js"), "--root", rootDir, "--once"],
      { env: { ...process.env, ...env }, stdio: "pipe" }
    );
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve({ code, stderr });
      else reject(new Error(`process exit ${code}: ${stderr}`));
    });
  });
}

test("e2e: queued task applies sr changes and writes result", async () => {
  await withTempDir(async (root) => {
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.mkdir(path.join(root, "workspace"), { recursive: true });
    await fs.mkdir(path.join(root, "bridge"), { recursive: true });

    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify(
        {
          paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
          poll_interval_ms: 10,
          openai: { provider: "ollama", model: "x", base_url: "http://localhost:11434" },
          ollama: { base_url: "http://localhost:11434", model: "x" },
          context_limits: { max_file_bytes: 32768, max_files: 60, include_exts: ["txt"] },
          git: { default_branch: "main", user_name: "t", user_email: "t@t" }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    await fs.writeFile(
      path.join(root, "tasks", "task.json"),
      JSON.stringify(
        { schema_version: 1, task_id: "t1", instruction: "write a.txt", status: "queued" },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const mockOut = [
      "```sr",
      "FILE: a.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "hello",
      ">>>",
      "```"
    ].join("\n");

    const mockPath = path.join(root, "tasks", "mock_response.txt");
    await fs.writeFile(mockPath, mockOut, "utf8");

    await runOnce(root, { AGENT_BRIDGE_RESPONSE_FILE: mockPath });

    const result = JSON.parse(await fs.readFile(path.join(root, "tasks", "result.json"), "utf8"));
    assert.equal(result.task_id, "t1");
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.ok(result.commit);
    assert.ok(result.raw_output_path);
    assert.equal(result.attempts, 1);

    const content = await fs.readFile(path.join(root, "workspace", "a.txt"), "utf8");
    assert.equal(content, "hello");

    const task = JSON.parse(await fs.readFile(path.join(root, "tasks", "task.json"), "utf8"));
    assert.equal(task.status, "done");
  });
});

test("e2e: retry when first model output is invalid (no sr blocks)", async () => {
  await withTempDir(async (root) => {
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.mkdir(path.join(root, "workspace"), { recursive: true });
    await fs.mkdir(path.join(root, "bridge"), { recursive: true });

    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify(
        {
          paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
          poll_interval_ms: 10,
          openai: { provider: "ollama", model: "x", base_url: "http://localhost:11434" },
          context_limits: { max_file_bytes: 32768, max_files: 60, include_exts: ["txt"] },
          git: { default_branch: "main", user_name: "t", user_email: "t@t" }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    await fs.writeFile(
      path.join(root, "tasks", "task.json"),
      JSON.stringify({ schema_version: 1, task_id: "t2", instruction: "write b.txt", status: "queued" }, null, 2) +
        "\n",
      "utf8"
    );

    const badOut = "no blocks here";
    const goodOut = [
      "```sr",
      "FILE: b.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "ok",
      ">>>",
      "```"
    ].join("\n");

    const p1 = path.join(root, "tasks", "mock1.txt");
    const p2 = path.join(root, "tasks", "mock2.txt");
    await fs.writeFile(p1, badOut, "utf8");
    await fs.writeFile(p2, goodOut, "utf8");

    await runOnce(root, {
      AGENT_BRIDGE_RESPONSE_FILES: [p1, p2].join(","),
      AGENT_BRIDGE_RESPONSE_FILES_IDX: "0"
    });

    const result = JSON.parse(await fs.readFile(path.join(root, "tasks", "result.json"), "utf8"));
    assert.equal(result.task_id, "t2");
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length >= 1);

    const content = await fs.readFile(path.join(root, "workspace", "b.txt"), "utf8");
    assert.equal(content, "ok");
  });
});

test("e2e: retry when verifier fails on JS syntax error", async () => {
  await withTempDir(async (root) => {
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.mkdir(path.join(root, "workspace"), { recursive: true });
    await fs.mkdir(path.join(root, "bridge"), { recursive: true });

    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify(
        {
          paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
          poll_interval_ms: 10,
          openai: { provider: "ollama", model: "x", base_url: "http://localhost:11434" },
          ollama: { base_url: "http://localhost:11434", model: "x" },
          context_limits: { max_file_bytes: 32768, max_files: 60, include_exts: ["js"] },
          git: { default_branch: "main", user_name: "t", user_email: "t@t" }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    await fs.writeFile(
      path.join(root, "tasks", "task.json"),
      JSON.stringify({ schema_version: 1, task_id: "t3", instruction: "create c.js", status: "queued" }, null, 2) +
        "\n",
      "utf8"
    );

    const badJs = [
      "```sr",
      "FILE: c.js",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "function(){",
      ">>>",
      "```"
    ].join("\n");

    const goodJs = [
      "```sr",
      "FILE: c.js",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "console.log('ok');",
      ">>>",
      "```"
    ].join("\n");

    const p1 = path.join(root, "tasks", "mock_bad_js.txt");
    const p2 = path.join(root, "tasks", "mock_good_js.txt");
    await fs.writeFile(p1, badJs, "utf8");
    await fs.writeFile(p2, goodJs, "utf8");

    await runOnce(root, {
      AGENT_BRIDGE_RESPONSE_FILES: [p1, p2].join(","),
      AGENT_BRIDGE_RESPONSE_FILES_IDX: "0"
    });

    const result = JSON.parse(await fs.readFile(path.join(root, "tasks", "result.json"), "utf8"));
    assert.equal(result.task_id, "t3");
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);

    const content = await fs.readFile(path.join(root, "workspace", "c.js"), "utf8");
    assert.ok(content.includes("console.log"));
  });
});

test("e2e: retry when safeApplyPatch fails on non-unique SEARCH", async () => {
  await withTempDir(async (root) => {
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.mkdir(path.join(root, "workspace"), { recursive: true });
    await fs.mkdir(path.join(root, "bridge"), { recursive: true });

    // Seed a committed file so autoRollback doesn't wipe it.
    const ws = path.join(root, "workspace");
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "d.txt"), "x x x", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify(
        {
          paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
          poll_interval_ms: 10,
          openai: { provider: "ollama", model: "x", base_url: "http://localhost:11434" },
          context_limits: { max_file_bytes: 32768, max_files: 60, include_exts: ["txt"] },
          git: { default_branch: "main", user_name: "t", user_email: "t@t" }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    await fs.writeFile(
      path.join(root, "tasks", "task.json"),
      JSON.stringify({ schema_version: 1, task_id: "t4", instruction: "edit d.txt", status: "queued" }, null, 2) +
        "\n",
      "utf8"
    );

    const nonUnique = [
      "```sr",
      "FILE: d.txt",
      "SEARCH:",
      "<<<",
      "x",
      ">>>",
      "REPLACE:",
      "<<<",
      "y",
      ">>>",
      "```"
    ].join("\n");

    const overwrite = [
      "```sr",
      "FILE: d.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "y",
      ">>>",
      "```"
    ].join("\n");

    const p1 = path.join(root, "tasks", "mock_non_unique.txt");
    const p2 = path.join(root, "tasks", "mock_overwrite.txt");
    await fs.writeFile(p1, nonUnique, "utf8");
    await fs.writeFile(p2, overwrite, "utf8");

    await runOnce(root, {
      AGENT_BRIDGE_RESPONSE_FILES: [p1, p2].join(","),
      AGENT_BRIDGE_RESPONSE_FILES_IDX: "0"
    });

    const result = JSON.parse(await fs.readFile(path.join(root, "tasks", "result.json"), "utf8"));
    assert.equal(result.task_id, "t4");
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);

    const content = await fs.readFile(path.join(ws, "d.txt"), "utf8");
    assert.equal(content, "y");
  });
});

test("e2e: retry when safeApplyPatch fails on got 0 SEARCH mismatch includes snippets", async () => {
  await withTempDir(async (root) => {
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.mkdir(path.join(root, "workspace"), { recursive: true });
    await fs.mkdir(path.join(root, "bridge"), { recursive: true });

    // Seed a committed file so autoRollback doesn't wipe it.
    const ws = path.join(root, "workspace");
    await gitManager.ensureRepo(ws, { default_branch: "main", user_name: "t", user_email: "t@t" });
    await fs.writeFile(path.join(ws, "d.txt"), "alpha\nbeta\ngamma\n", "utf8");
    await gitManager.runGit(ws, ["add", "-A"]);
    await gitManager.runGit(ws, ["commit", "-m", "seed"]);

    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify(
        {
          paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
          poll_interval_ms: 10,
          openai: { provider: "ollama", model: "x", base_url: "http://localhost:11434" },
          context_limits: { max_file_bytes: 32768, max_files: 60, include_exts: ["txt"] },
          git: { default_branch: "main", user_name: "t", user_email: "t@t" }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    await fs.writeFile(
      path.join(root, "tasks", "task.json"),
      JSON.stringify({ schema_version: 1, task_id: "t4_got0", instruction: "edit d.txt", status: "queued" }, null, 2) +
        "\n",
      "utf8"
    );

    const got0 = [
      "```sr",
      "FILE: d.txt",
      "SEARCH:",
      "<<<",
      "does not exist",
      ">>>",
      "REPLACE:",
      "<<<",
      "y",
      ">>>",
      "```"
    ].join("\n");

    const overwrite = [
      "```sr",
      "FILE: d.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "y",
      ">>>",
      "```"
    ].join("\n");

    const p1 = path.join(root, "tasks", "mock_got0.txt");
    const p2 = path.join(root, "tasks", "mock_overwrite2.txt");
    await fs.writeFile(p1, got0, "utf8");
    await fs.writeFile(p2, overwrite, "utf8");

    await runOnce(root, {
      AGENT_BRIDGE_RESPONSE_FILES: [p1, p2].join(","),
      AGENT_BRIDGE_RESPONSE_FILES_IDX: "0"
    });

    const result = JSON.parse(await fs.readFile(path.join(root, "tasks", "result.json"), "utf8"));
    assert.equal(result.task_id, "t4_got0");
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);

    const applyErr = Array.isArray(result.errors)
      ? result.errors.find((e) => e && e.stage === "apply" && e.details && e.details.occurrences === 0)
      : null;
    assert.ok(applyErr, "expected an apply error with occurrences=0");
    assert.ok(applyErr.details.snippet_feedback || applyErr.details.file_snippets, "expected snippet feedback in error details");

    const content = await fs.readFile(path.join(ws, "d.txt"), "utf8");
    assert.equal(content, "y");
  });
});

test("e2e: long-horizon task executes DAG subtasks with checkpoints and final squash", async () => {
  await withTempDir(async (root) => {
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.mkdir(path.join(root, "workspace"), { recursive: true });
    await fs.mkdir(path.join(root, "bridge"), { recursive: true });

    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify(
        {
          paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
          poll_interval_ms: 10,
          openai: { provider: "ollama", model: "x", base_url: "http://localhost:11434" },
          anthropic: { enabled: false },
          context_limits: { max_file_bytes: 32768, max_files: 60, include_exts: ["txt"] },
          git: { default_branch: "main", user_name: "t", user_email: "t@t" }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    // Force high difficulty via keywords + 3 likely paths
    const instruction = "refactor architecture module tests for a.txt b.txt c.txt";
    await fs.writeFile(
      path.join(root, "tasks", "task.json"),
      JSON.stringify({ schema_version: 1, task_id: "t_long", instruction, status: "queued" }, null, 2) + "\n",
      "utf8"
    );

    const plan = [
      { subtask_id: "s1", description: "write a.txt", target_files: ["a.txt"], dependencies: [] },
      { subtask_id: "s2", description: "write b.txt", target_files: ["b.txt"], dependencies: ["s1"] },
      { subtask_id: "s3", description: "write c.txt", target_files: ["c.txt"], dependencies: ["s2"] }
    ];
    const planPath = path.join(root, "tasks", "mock_plan.json");
    await fs.writeFile(planPath, JSON.stringify(plan, null, 2) + "\n", "utf8");

    const out1 = [
      "```sr",
      "FILE: a.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "A",
      ">>>",
      "```"
    ].join("\n");
    const out2 = [
      "```sr",
      "FILE: b.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "B",
      ">>>",
      "```"
    ].join("\n");
    const out3 = [
      "```sr",
      "FILE: c.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "C",
      ">>>",
      "```"
    ].join("\n");

    const p1 = path.join(root, "tasks", "mock_sub1.txt");
    const p2 = path.join(root, "tasks", "mock_sub2.txt");
    const p3 = path.join(root, "tasks", "mock_sub3.txt");
    await fs.writeFile(p1, out1, "utf8");
    await fs.writeFile(p2, out2, "utf8");
    await fs.writeFile(p3, out3, "utf8");

    await runOnce(root, {
      AGENT_BRIDGE_PLAN_RESPONSE_FILE: planPath,
      AGENT_BRIDGE_RESPONSE_FILES: [p1, p2, p3].join(","),
      AGENT_BRIDGE_RESPONSE_FILES_IDX: "0"
    });

    const result = JSON.parse(await fs.readFile(path.join(root, "tasks", "result.json"), "utf8"));
    assert.equal(result.task_id, "t_long");
    assert.equal(result.ok, true);
    assert.equal(result.changed, true);
    assert.ok(result.commit);
    assert.ok(result.final_commit);
    assert.ok(Array.isArray(result.execution_trace));
    assert.equal(result.execution_trace.length, 3);
    assert.ok(result.plan_tree);
    assert.equal(result.attempts, 3);

    for (const t of result.execution_trace) {
      assert.equal(t.status, "done");
      assert.ok(t.checkpoint_before_sha);
      // Each subtask should usually have a checkpoint commit (non-empty changes)
      assert.ok(t.checkpoint_commit_sha);
      assert.ok(Array.isArray(t.raw_output_paths));
      assert.ok(t.raw_output_paths.length >= 1);
    }

    const a = await fs.readFile(path.join(root, "workspace", "a.txt"), "utf8");
    const b = await fs.readFile(path.join(root, "workspace", "b.txt"), "utf8");
    const c = await fs.readFile(path.join(root, "workspace", "c.txt"), "utf8");
    assert.equal(a, "A");
    assert.equal(b, "B");
    assert.equal(c, "C");
  });
});

test("e2e: medium difficulty triggers semantic review retry (mocked)", async () => {
  await withTempDir(async (root) => {
    await fs.mkdir(path.join(root, "tasks"), { recursive: true });
    await fs.mkdir(path.join(root, "workspace"), { recursive: true });
    await fs.mkdir(path.join(root, "bridge"), { recursive: true });

    await fs.writeFile(
      path.join(root, "config.json"),
      JSON.stringify(
        {
          paths: { workspace: "workspace", tasks: "tasks", log: "bridge.log" },
          poll_interval_ms: 10,
          openai: { provider: "ollama", model: "x", base_url: "http://localhost:11434" },
          context_limits: { max_file_bytes: 32768, max_files: 60, include_exts: ["txt"] },
          git: { default_branch: "main", user_name: "t", user_email: "t@t" }
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    await fs.writeFile(
      path.join(root, "tasks", "task.json"),
      JSON.stringify(
        { schema_version: 1, task_id: "t5", instruction: "refactor a.txt and b.txt", status: "queued" },
        null,
        2
      ) + "\n",
      "utf8"
    );

    const sr = [
      "```sr",
      "FILE: a.txt",
      "SEARCH:",
      "<<<",
      "",
      ">>>",
      "REPLACE:",
      "<<<",
      "hello",
      ">>>",
      "```"
    ].join("\n");

    const p1 = path.join(root, "tasks", "mock_gen1.txt");
    const p2 = path.join(root, "tasks", "mock_gen2.txt");
    await fs.writeFile(p1, sr, "utf8");
    await fs.writeFile(p2, sr, "utf8");

    const r1 = path.join(root, "tasks", "mock_review1.json");
    const r2 = path.join(root, "tasks", "mock_review2.json");
    await fs.writeFile(
      r1,
      JSON.stringify(
        {
          ok: false,
          issues: [{ severity: "blocker", message: "not good enough", file: "a.txt" }],
          feedback_for_generator: "make it better"
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(
      r2,
      JSON.stringify(
        { ok: true, issues: [], feedback_for_generator: "ok" },
        null,
        2
      ),
      "utf8"
    );

    await runOnce(root, {
      AGENT_BRIDGE_RESPONSE_FILES: [p1, p2].join(","),
      AGENT_BRIDGE_RESPONSE_FILES_IDX: "0",
      AGENT_BRIDGE_REVIEW_RESPONSE_FILES: [r1, r2].join(","),
      AGENT_BRIDGE_REVIEW_RESPONSE_FILES_IDX: "0"
    });

    const result = JSON.parse(await fs.readFile(path.join(root, "tasks", "result.json"), "utf8"));
    assert.equal(result.task_id, "t5");
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.some((e) => e.stage === "semantic_verify"));

    const content = await fs.readFile(path.join(root, "workspace", "a.txt"), "utf8");
    assert.equal(content, "hello");
  });
});