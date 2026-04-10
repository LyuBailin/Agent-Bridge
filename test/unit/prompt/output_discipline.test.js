const test = require("node:test");
const assert = require("node:assert/strict");

const { buildOutputDiscipline } = require("../../../src/prompt/output_discipline");

test("buildOutputDiscipline: returns a string", () => {
  const d = buildOutputDiscipline();
  assert.equal(typeof d, "string");
  assert.ok(d.length > 0);
});

test("buildOutputDiscipline: covers sr and op blocks", () => {
  const d = buildOutputDiscipline();
  assert.ok(d.includes("sr") || d.includes("SEARCH"));
  assert.ok(d.includes("op") || d.includes("MKDIR"));
});

test("buildOutputDiscipline: mentions denied operations", () => {
  const d = buildOutputDiscipline();
  assert.ok(
    d.includes("denied") ||
    d.includes("blocked") ||
    d.includes("bash") ||
    d.includes("exec")
  );
});

test("buildOutputDiscipline: mentions workspace constraint", () => {
  const d = buildOutputDiscipline();
  assert.ok(
    d.includes("workspace") ||
    d.includes("relative")
  );
});
