const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");

const simulation = require("../../../src/utils/simulation");

async function withTempFile(content, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_sim_"));
  const filePath = path.join(dir, "mock.txt");
  await fs.writeFile(filePath, content, "utf8");
  try {
    return await fn(filePath);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("readMockTextFromEnv: returns null when no env vars set", async () => {
  delete process.env.AGENT_BRIDGE_RESPONSE_FILE;
  delete process.env.AGENT_BRIDGE_RESPONSE_FILES;
  const r = await simulation.readMockTextFromEnv({
    singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
    listVar: "AGENT_BRIDGE_RESPONSE_FILES",
    listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
  });
  assert.equal(r, null);
});

test("readMockTextFromEnv: reads single file from env var", async () => {
  await withTempFile("hello world", async (fp) => {
    process.env.AGENT_BRIDGE_RESPONSE_FILE = fp;
    try {
      const r = await simulation.readMockTextFromEnv({
        singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
        listVar: "AGENT_BRIDGE_RESPONSE_FILES",
        listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
      });
      assert.equal(r, "hello world");
    } finally {
      delete process.env.AGENT_BRIDGE_RESPONSE_FILE;
    }
  });
});

test("readMockTextFromEnv: reads from list (sequential round-robin)", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_sim2_"));
  const p1 = path.join(dir, "f1.txt");
  const p2 = path.join(dir, "f2.txt");
  const p3 = path.join(dir, "f3.txt");
  await fs.writeFile(p1, "file-1", "utf8");
  await fs.writeFile(p2, "file-2", "utf8");
  await fs.writeFile(p3, "file-3", "utf8");

  process.env.AGENT_BRIDGE_RESPONSE_FILES = `${p1},${p2},${p3}`;
  process.env.AGENT_BRIDGE_RESPONSE_FILES_IDX = "0";
  try {
    const r1 = await simulation.readMockTextFromEnv({
      singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
      listVar: "AGENT_BRIDGE_RESPONSE_FILES",
      listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
    });
    assert.equal(r1, "file-1");

    const r2 = await simulation.readMockTextFromEnv({
      singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
      listVar: "AGENT_BRIDGE_RESPONSE_FILES",
      listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
    });
    assert.equal(r2, "file-2");

    const r3 = await simulation.readMockTextFromEnv({
      singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
      listVar: "AGENT_BRIDGE_RESPONSE_FILES",
      listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
    });
    assert.equal(r3, "file-3");
  } finally {
    delete process.env.AGENT_BRIDGE_RESPONSE_FILES;
    delete process.env.AGENT_BRIDGE_RESPONSE_FILES_IDX;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("readMockTextFromEnv: wraps around when list exhausted", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_sim3_"));
  const p1 = path.join(dir, "only.txt");
  await fs.writeFile(p1, "only", "utf8");

  process.env.AGENT_BRIDGE_RESPONSE_FILES = p1;
  process.env.AGENT_BRIDGE_RESPONSE_FILES_IDX = "0";
  try {
    const r1 = await simulation.readMockTextFromEnv({
      singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
      listVar: "AGENT_BRIDGE_RESPONSE_FILES",
      listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
    });
    const r2 = await simulation.readMockTextFromEnv({
      singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
      listVar: "AGENT_BRIDGE_RESPONSE_FILES",
      listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
    });
    assert.equal(r1, "only");
    assert.equal(r2, "only"); // wrapped around
  } finally {
    delete process.env.AGENT_BRIDGE_RESPONSE_FILES;
    delete process.env.AGENT_BRIDGE_RESPONSE_FILES_IDX;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("readMockJsonFromEnv: parses JSON from mock file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agent_bridge_sim4_"));
  const p = path.join(dir, "plan.json");
  await fs.writeFile(p, JSON.stringify({ foo: "bar" }), "utf8");

  process.env.AGENT_BRIDGE_PLAN_RESPONSE_FILE = p;
  try {
    const r = await simulation.readMockJsonFromEnv({
      singleVar: "AGENT_BRIDGE_PLAN_RESPONSE_FILE",
      listVar: "AGENT_BRIDGE_PLAN_RESPONSE_FILES",
      listIdxVar: "AGENT_BRIDGE_PLAN_RESPONSE_FILES_IDX"
    });
    assert.deepEqual(r, { foo: "bar" });
  } finally {
    delete process.env.AGENT_BRIDGE_PLAN_RESPONSE_FILE;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("SIMULATION_ENV: exports all expected keys", () => {
  const e = simulation.SIMULATION_ENV;
  assert.ok(e.RESPONSE_FILE);
  assert.ok(e.RESPONSE_FILES);
  assert.ok(e.PLAN_RESPONSE_FILE);
  assert.ok(e.REVIEW_RESPONSE_FILE);
  assert.ok(e.REPLAN_RESPONSE_FILE);
});
