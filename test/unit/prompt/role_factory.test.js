const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRolePrompt,
  getAvailableRoles,
  getRoleTools,
  ROLES,
} = require("../../../src/prompt/role_factory");

test("ROLES: exports implementation, verification, planning, readonly_explore", () => {
  assert.ok(ROLES.implementation);
  assert.ok(ROLES.verification);
  assert.ok(ROLES.planning);
  assert.ok(ROLES.readonly_explore);
});

test("getAvailableRoles: returns array of role names", () => {
  const roles = getAvailableRoles();
  assert.ok(Array.isArray(roles));
  assert.ok(roles.includes("implementation"));
  assert.ok(roles.includes("verification"));
  assert.ok(roles.includes("planning"));
  assert.ok(roles.includes("readonly_explore"));
});

test("getRoleTools: returns tools for known role", () => {
  const tools = getRoleTools("implementation");
  // Should be null (default toolset) or array
  assert.ok(tools === null || Array.isArray(tools));
});

test("getRoleTools: returns null for unknown role", () => {
  assert.equal(getRoleTools("unknown_role"), null);
});

test("buildRolePrompt: returns string for implementation", () => {
  const p = buildRolePrompt("implementation");
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildRolePrompt: returns string for verification", () => {
  const p = buildRolePrompt("verification");
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildRolePrompt: returns string for planning", () => {
  const p = buildRolePrompt("planning");
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildRolePrompt: returns string for readonly_explore", () => {
  const p = buildRolePrompt("readonly_explore");
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});

test("buildRolePrompt: throws for unknown role", () => {
  assert.throws(
    () => buildRolePrompt("nonexistent_role"),
    /Unknown role/
  );
});

test("buildRolePrompt: includes base sections (identity, rules, guidelines)", () => {
  const p = buildRolePrompt("implementation");
  assert.ok(p.includes("professional") || p.includes("code") || p.includes("agent"));
});

test("buildRolePrompt: accepts context parameter", () => {
  const p = buildRolePrompt("implementation", { extra: "value" });
  assert.equal(typeof p, "string");
  assert.ok(p.length > 0);
});
