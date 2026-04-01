const path = require("node:path");
const fsTools = require("./fs_tools");

function nowIso() {
  // Return ISO format in Beijing time (UTC+8)
  const now = new Date();
  // Add 8 hours to convert to Beijing time
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString();
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function extractLikelyPaths(instruction) {
  const text = String(instruction ?? "");

  // Very lightweight heuristic: look for segments containing a dot-ext or a slash.
  // Keep this conservative; it's only used for difficulty scoring.
  const candidates = [];

  const quoted = text.match(/["'`][^"'`]+["'`]/g) ?? [];
  for (const q of quoted) {
    candidates.push(q.slice(1, -1));
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  for (const t of tokens) candidates.push(t);

  const paths = [];
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes("..")) continue;
    if (c.includes("\\") || c.includes("/")) {
      paths.push(c.replace(/^\.\/+/, ""));
      continue;
    }
    if (/\.[a-zA-Z0-9]{1,8}$/.test(c)) {
      paths.push(c.replace(/^\.\/+/, ""));
    }
  }

  return unique(
    paths
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split(/[),;:]+$/)[0])
      .map((p) => p.split(/^[({\[]+/)[1] ?? p)
  );
}

function isPlainObject(x) {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function analyzeDifficulty(instruction) {
  const text = String(instruction ?? "");
  const lc = text.toLowerCase();
  const zh = text;

  const highKeywords = [
    "refactor",
    "migrate",
    "migration",
    "architecture",
    "module",
    "tests",
    "test",
    "ci",
    "pipeline"
  ];
  const highZh = ["重构", "迁移", "多文件", "模块", "架构", "测试", "CI"];

  const mediumKeywords = ["feature", "integrate", "integration", "api", "interface", "call chain"];
  const mediumZh = ["新增功能", "集成", "接口", "调用链"];

  const likelyPaths = extractLikelyPaths(text);
  if (unique(likelyPaths).length >= 3) return "high";
  if (highKeywords.some((k) => lc.includes(k)) || highZh.some((k) => zh.includes(k))) {
    return "high";
  }
  if (unique(likelyPaths).length === 2) return "medium";
  if (mediumKeywords.some((k) => lc.includes(k)) || mediumZh.some((k) => zh.includes(k))) {
    return "medium";
  }
  return "low";
}

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? n : 0;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function keywordHits(instruction) {
  const text = String(instruction ?? "");
  const lc = text.toLowerCase();

  const highKeywords = [
    "refactor",
    "migrate",
    "migration",
    "architecture",
    "module",
    "tests",
    "test",
    "ci",
    "pipeline"
  ];
  const highZh = ["重构", "迁移", "多文件", "模块", "架构", "测试", "CI"];

  const mediumKeywords = ["feature", "integrate", "integration", "api", "interface", "call chain"];
  const mediumZh = ["新增功能", "集成", "接口", "调用链"];

  const hits = { high: 0, medium: 0 };
  for (const k of highKeywords) if (lc.includes(k)) hits.high += 1;
  for (const k of highZh) if (text.includes(k)) hits.high += 1;
  for (const k of mediumKeywords) if (lc.includes(k)) hits.medium += 1;
  for (const k of mediumZh) if (text.includes(k)) hits.medium += 1;
  return hits;
}

function evaluateComplexity(instruction, contextStat = {}, thresholds = {}) {
  const text = String(instruction ?? "");
  const likelyPaths = Array.isArray(contextStat?.likelyPaths)
    ? contextStat.likelyPaths
    : extractLikelyPaths(text);

  const likelyPathCount =
    Number.isFinite(contextStat?.likelyPathCount) ? contextStat.likelyPathCount : likelyPaths.length;

  const lineSum = Number.isFinite(contextStat?.existingLikelyFilesLineSum)
    ? contextStat.existingLikelyFilesLineSum
    : 0;

  const hits = contextStat?.keywordHits && typeof contextStat.keywordHits === "object"
    ? contextStat.keywordHits
    : keywordHits(text);

  let score = 0;

  if (likelyPathCount >= 4) score += 45;
  else if (likelyPathCount >= 3) score += 40;
  else if (likelyPathCount === 2) score += 25;
  else if (likelyPathCount === 1) score += 10;

  score += Math.min(40, (hits.high ?? 0) * 15 + (hits.medium ?? 0) * 8);

  if (lineSum > 2000) score += 40;
  else if (lineSum > 800) score += 30;
  else if (lineSum > 200) score += 15;
  else if (lineSum > 50) score += 5;

  if (text.length > 240) score += 5;

  score = clampInt(score, 0, 100);

  const thrMedium = Number.isFinite(thresholds?.medium) ? thresholds.medium : 35;
  const thrHigh = Number.isFinite(thresholds?.high) ? thresholds.high : 70;

  const difficulty = score >= thrHigh ? "high" : score >= thrMedium ? "medium" : "low";
  return { score, difficulty, likelyPaths };
}

function estimateTokens(text) {
  // Deterministic rough estimate to keep trimming reproducible.
  return Math.ceil(String(text ?? "").length / 4);
}

function stripTruncatedSuffix(fileHeaderValue) {
  const s = String(fileHeaderValue ?? "").trim();
  const idx = s.indexOf(" (TRUNCATED");
  return (idx >= 0 ? s.slice(0, idx) : s).trim();
}

function splitContextWithGit(rawContext) {
  const text = String(rawContext ?? "");
  const idx = text.indexOf("\nGIT SUMMARY:");
  if (idx >= 0) {
    return { main: text.slice(0, idx), git: text.slice(idx) };
  }
  return { main: text, git: "" };
}

function parseFileBlocks(contextText) {
  const text = String(contextText ?? "");
  const positions = [];
  const re = /^FILE:\s*/gm;
  let m;
  while ((m = re.exec(text))) positions.push(m.index);

  if (positions.length === 0) {
    return { tree: text, files: [] };
  }

  const tree = text.slice(0, positions[0]);
  const files = [];
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i];
    const end = i + 1 < positions.length ? positions[i + 1] : text.length;
    const block = text.slice(start, end);
    const headerLine = block.split(/\r?\n/, 1)[0] ?? "";
    const headerValue = headerLine.replace(/^FILE:\s*/i, "");
    const rel = stripTruncatedSuffix(headerValue);
    files.push({ rel, block });
  }
  return { tree, files };
}

function optimizeContext(difficulty, rawContext, policy = {}) {
  const maxTokens = Number.isFinite(policy?.max_tokens) ? policy.max_tokens : null;
  if (!maxTokens || maxTokens <= 0) return String(rawContext ?? "");

  const likelyPaths = Array.isArray(policy?.likely_paths) ? policy.likely_paths : [];

  const { main, git } = splitContextWithGit(rawContext);
  const parsed = parseFileBlocks(main);

  const likelySet = new Set(likelyPaths);
  const likely = [];
  const other = [];
  for (const f of parsed.files) {
    if (likelySet.has(f.rel)) likely.push(f);
    else other.push(f);
  }

  const base = `${parsed.tree}${git ? "\n" : ""}${git}`.trimEnd() + "\n";
  let out = base;
  let used = estimateTokens(out);

  function tryAdd(block) {
    const next = out + "\n" + block.trimEnd() + "\n";
    const tokens = estimateTokens(next);
    if (tokens > maxTokens) return false;
    out = next;
    used = tokens;
    return true;
  }

  for (const f of likely) {
    if (!tryAdd(f.block)) break;
  }
  for (const f of other) {
    if (!tryAdd(f.block)) break;
  }

  // As a last resort, if even base exceeds budget, hard-trim deterministically.
  if (used > maxTokens) {
    const budgetChars = Math.max(0, maxTokens * 4);
    out = out.slice(0, budgetChars);
  }

  return out.trimEnd() + "\n";
}

function prepareSubtasks(task, workspaceDir, opts = {}) {
  const difficulty = analyzeDifficulty(task?.instruction);
  const recentCommits = Number.isFinite(opts?.recent_commits) ? opts.recent_commits : 10;

  return {
    difficulty,
    contextPlan: {
      mode: "full",
      includeGitSummary: true,
      recentCommits
    },
    gitSummary: {
      recentCommits: [],
      diffStat: "",
      nameStatus: ""
    },
    subtasks: [],
    workspaceRootName: path.basename(String(workspaceDir ?? "workspace"))
  };
}

function buildPlanSchemaJson() {
  return JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["subtasks"],
    properties: {
      subtasks: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["subtask_id", "description", "target_files", "dependencies"],
          properties: {
            subtask_id: { type: "string" },
            description: { type: "string" },
            target_files: { type: "array", items: { type: "string" } },
            dependencies: { type: "array", items: { type: "string" } }
          }
        }
      }
    }
  });
}

async function readMockJsonFromEnv({ singleVar, listVar, listIdxVar }) {
  // Allows CI/offline planning tests without requiring Claude CLI.
  const fs = require("node:fs/promises");
  const mockPath = process.env[singleVar];
  if (mockPath) {
    const abs = path.resolve(mockPath);
    const text = await fs.readFile(abs, "utf8");
    return JSON.parse(text);
  }

  const mockList = process.env[listVar];
  if (mockList) {
    const files = mockList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (files.length > 0) {
      const idx = Math.min(Number.parseInt(process.env[listIdxVar] ?? "0", 10) || 0, files.length - 1);
      const abs = path.resolve(files[idx]);
      process.env[listIdxVar] = String(idx + 1);
      const text = await fs.readFile(abs, "utf8");
      return JSON.parse(text);
    }
  }
  return null;
}

function buildSingleNodePlanTree(taskId, instruction, targetFiles = [], limits = {}) {
  const now = nowIso();
  const maxSubtasks = Number.isFinite(limits?.max_subtasks) ? limits.max_subtasks : 12;
  const maxReplans = Number.isFinite(limits?.max_replans) ? limits.max_replans : 2;

  const id = "s1";
  const safeTargets = [];
  for (const f of Array.isArray(targetFiles) ? targetFiles : []) {
    try {
      safeTargets.push(fsTools.assertSafeRelPath(f));
    } catch {
      // ignore unsafe
    }
  }

  return {
    schema_version: 1,
    task_id: String(taskId ?? ""),
    created_at: now,
    updated_at: now,
    replans: 0,
    order: [id],
    nodes: {
      [id]: {
        id,
        description: String(instruction ?? ""),
        target_files: unique(safeTargets),
        dependencies: [],
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
    limits: { max_subtasks: maxSubtasks, max_replans: maxReplans }
  };
}

function validatePlanTree(planTree) {
  if (!isPlainObject(planTree)) throw new Error("planTree must be an object");
  if (planTree.schema_version !== 1) throw new Error("planTree.schema_version must be 1");
  if (typeof planTree.task_id !== "string") throw new Error("planTree.task_id must be a string");
  if (!Array.isArray(planTree.order) || planTree.order.length === 0) {
    throw new Error("planTree.order must be a non-empty array");
  }
  if (!isPlainObject(planTree.nodes)) throw new Error("planTree.nodes must be an object");
  if (!isPlainObject(planTree.limits)) throw new Error("planTree.limits must be an object");

  const maxSubtasks = Number.isFinite(planTree.limits.max_subtasks) ? planTree.limits.max_subtasks : 12;
  const nodeIds = Object.keys(planTree.nodes);
  if (nodeIds.length === 0) throw new Error("planTree.nodes must not be empty");
  if (nodeIds.length > maxSubtasks) throw new Error(`planTree exceeds max_subtasks (${maxSubtasks})`);

  const idSet = new Set(nodeIds);
  for (const id of nodeIds) {
    const n = planTree.nodes[id];
    if (!n || typeof n !== "object") throw new Error(`node ${id} must be an object`);
    if (n.id !== id) throw new Error(`node ${id} id mismatch`);
    if (typeof n.description !== "string" || !n.description.trim()) {
      throw new Error(`node ${id} missing description`);
    }
    if (!Array.isArray(n.dependencies)) throw new Error(`node ${id} dependencies must be array`);
    for (const dep of n.dependencies) {
      if (typeof dep !== "string" || !dep.trim()) throw new Error(`node ${id} has invalid dependency`);
      if (!idSet.has(dep)) throw new Error(`node ${id} depends on missing node ${dep}`);
    }

    if (!Array.isArray(n.target_files)) throw new Error(`node ${id} target_files must be array`);
    for (const f of n.target_files) {
      if (typeof f !== "string") throw new Error(`node ${id} target_files contains non-string`);
      fsTools.assertSafeRelPath(f);
    }
  }

  // Ensure order contains every node once
  const seen = new Set();
  for (const id of planTree.order) {
    if (!idSet.has(id)) throw new Error(`planTree.order contains unknown id ${id}`);
    if (seen.has(id)) throw new Error(`planTree.order contains duplicate id ${id}`);
    seen.add(id);
  }
  if (seen.size !== idSet.size) throw new Error("planTree.order must include all nodes exactly once");

  // DAG check via Kahn
  const indeg = new Map(nodeIds.map((id) => [id, 0]));
  const out = new Map(nodeIds.map((id) => [id, []]));
  for (const id of nodeIds) {
    for (const dep of planTree.nodes[id].dependencies) {
      indeg.set(id, (indeg.get(id) ?? 0) + 1);
      out.get(dep).push(id);
    }
  }
  const q = [];
  for (const [id, d] of indeg.entries()) if (d === 0) q.push(id);
  let visited = 0;
  while (q.length) {
    const id = q.shift();
    visited += 1;
    for (const nxt of out.get(id) ?? []) {
      indeg.set(nxt, (indeg.get(nxt) ?? 0) - 1);
      if (indeg.get(nxt) === 0) q.push(nxt);
    }
  }
  if (visited !== nodeIds.length) throw new Error("planTree has a cycle (not a DAG)");

  return planTree;
}

function enforceSequentialDependencies(nodes, order) {
  // Safety mechanism: For same-file edits, enforce sequential dependencies even if Claude missed them.
  // This prevents SEARCH pattern mismatches when multiple subtasks edit the same file.
  
  // Build file-to-nodes map
  const fileToNodes = new Map();
  for (const id of order) {
    const node = nodes[id];
    if (!node || !Array.isArray(node.target_files)) continue;
    for (const file of node.target_files) {
      if (!fileToNodes.has(file)) fileToNodes.set(file, []);
      fileToNodes.get(file).push(id);
    }
  }
  
  // For each file edited by multiple nodes, enforce sequential order
  for (const nodeIds of fileToNodes.values()) {
    if (nodeIds.length <= 1) continue; // Only one node edits this file
    
    // Sort by order index to maintain consistent sequence
    const nodeOrder = [];
    for (const id of order) {
      if (nodeIds.includes(id)) nodeOrder.push(id);
    }
    
    // Chain dependencies: s1 → s2 → s3
    for (let i = 1; i < nodeOrder.length; i += 1) {
      const prevId = nodeOrder[i - 1];
      const currId = nodeOrder[i];
      const currNode = nodes[currId];
      
      // Add prevId as dependency if not already present and doesn't create cycles
      if (!currNode.dependencies.includes(prevId)) {
        currNode.dependencies.push(prevId);
      }
    }
  }
  
  return nodes;
}

function normalizePlanArrayToTree(taskId, subtasks, limits = {}) {
  const now = nowIso();
  const maxSubtasks = Number.isFinite(limits?.max_subtasks) ? limits.max_subtasks : 12;
  const maxReplans = Number.isFinite(limits?.max_replans) ? limits.max_replans : 2;

  const nodes = {};
  const order = [];
  for (const st of subtasks) {
    if (!st || typeof st !== "object") continue;
    const id = String(st.subtask_id ?? "").trim();
    if (!id) continue;
    if (nodes[id]) throw new Error(`duplicate subtask_id: ${id}`);
    const description = String(st.description ?? "").trim();
    if (!description) throw new Error(`subtask ${id} missing description`);
    const targetFiles = Array.isArray(st.target_files) ? st.target_files.map((x) => String(x)) : [];
    const deps = Array.isArray(st.dependencies) ? st.dependencies.map((x) => String(x)) : [];

    const safeTargets = [];
    for (const f of targetFiles) {
      try {
        safeTargets.push(fsTools.assertSafeRelPath(f));
      } catch {
        // ignore unsafe entries
      }
    }

    nodes[id] = {
      id,
      description,
      target_files: unique(safeTargets),
      dependencies: unique(deps.filter(Boolean)),
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
    };
    order.push(id);
  }

  if (Object.keys(nodes).length === 0) {
    return buildSingleNodePlanTree(taskId, "", [], limits);
  }
  if (Object.keys(nodes).length > maxSubtasks) {
    throw new Error(`planner produced too many subtasks (${Object.keys(nodes).length} > ${maxSubtasks})`);
  }

  // Safety mechanism: enforce sequential dependencies for same-file edits
  enforceSequentialDependencies(nodes, order);

  const planTree = {
    schema_version: 1,
    task_id: String(taskId ?? ""),
    created_at: now,
    updated_at: now,
    replans: 0,
    order,
    nodes,
    limits: { max_subtasks: maxSubtasks, max_replans: maxReplans }
  };

  return validatePlanTree(planTree);
}

function normalizePlanArrayToPartialNodes(subtasks, limits = {}) {
  const maxSubtasks = Number.isFinite(limits?.max_subtasks) ? limits.max_subtasks : 12;
  const nodes = {};
  const order = [];

  for (const st of Array.isArray(subtasks) ? subtasks : []) {
    if (!st || typeof st !== "object") continue;
    const id = String(st.subtask_id ?? "").trim();
    if (!id) continue;
    if (nodes[id]) throw new Error(`duplicate subtask_id: ${id}`);
    const description = String(st.description ?? "").trim();
    if (!description) throw new Error(`subtask ${id} missing description`);
    const targetFiles = Array.isArray(st.target_files) ? st.target_files.map((x) => String(x)) : [];
    const deps = Array.isArray(st.dependencies) ? st.dependencies.map((x) => String(x)) : [];

    const safeTargets = [];
    for (const f of targetFiles) {
      try {
        safeTargets.push(fsTools.assertSafeRelPath(f));
      } catch {
        // ignore unsafe
      }
    }

    nodes[id] = {
      id,
      description,
      target_files: unique(safeTargets),
      dependencies: unique(deps.filter(Boolean)),
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
    };
    order.push(id);
  }

  if (Object.keys(nodes).length === 0) throw new Error("empty subtasks");
  if (Object.keys(nodes).length > maxSubtasks) {
    throw new Error(`planner produced too many subtasks (${Object.keys(nodes).length} > ${maxSubtasks})`);
  }

  return { order, nodes };
}

async function decomposeTask({ instruction, globalContext, claudeProvider, limits, task_id }) {
  const taskId = String(task_id ?? "");
  const maxSubtasks = Number.isFinite(limits?.max_subtasks) ? limits.max_subtasks : 12;

  // CI/offline hook
  const mock = await readMockJsonFromEnv({
    singleVar: "AGENT_BRIDGE_PLAN_RESPONSE_FILE",
    listVar: "AGENT_BRIDGE_PLAN_RESPONSE_FILES",
    listIdxVar: "AGENT_BRIDGE_PLAN_RESPONSE_FILES_IDX"
  }).catch(() => null);
  if (mock) {
    const arr = Array.isArray(mock) ? mock : Array.isArray(mock?.subtasks) ? mock.subtasks : null;
    if (arr) return normalizePlanArrayToTree(taskId, arr, limits);
  }

  if (!claudeProvider || typeof claudeProvider.generateJson !== "function") {
    return buildSingleNodePlanTree(taskId, instruction, [], limits);
  }

  const schema = buildPlanSchemaJson();
  const system = [
    "You are a senior engineering planner.",
    "Decompose the user's goal into a small DAG (directed acyclic graph) of executable subtasks.",
    "For high-complexity tasks, break them down into low and medium difficulty subtasks.",
    `Return at most ${maxSubtasks} subtasks.`,
    "Each subtask must be independently executable and small (atomic).",
    "Use stable ids like s1, s2, ...; list dependencies by id.",
    "target_files must be workspace-relative paths (no absolute paths, no '..', no '.git').",
    "",
    "CRITICAL DEPENDENCY RULES:",
    "- If multiple subtasks edit the SAME FILE, add sequential dependencies (s1 → s2 → s3).",
    "- For file moves/operations that affect imports, make file edits depend on the file operations.",
    "- Example: If s1 creates lib/ and s2 moves files to lib/ and s3 updates requires, order must be s1 → s2 → s3.",
    "- This ensures file state is consistent and SEARCH patterns find matches on first try.",
    "",
    "Return JSON matching the provided schema exactly."
  ].join("\n");

  const user = [
    "INSTRUCTION:",
    String(instruction ?? ""),
    "",
    "GLOBAL CONTEXT:",
    String(globalContext ?? "")
  ].join("\n");

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const json = await claudeProvider.generateJson({ system, user, schema });
      const arr = Array.isArray(json) ? json : json?.subtasks;
      if (!Array.isArray(arr)) throw new Error("planner output missing subtasks array");
      return normalizePlanArrayToTree(taskId, arr, limits);
    } catch (e) {
      lastErr = e;
      // retry with implicit feedback by appending error into user prompt
    }
  }
  return buildSingleNodePlanTree(taskId, instruction, [], limits);
}

function updatePlanState(planTree, subtaskId, patch) {
  const tree = validatePlanTree(planTree);
  const id = String(subtaskId ?? "").trim();
  if (!id || !tree.nodes[id]) throw new Error(`Unknown subtaskId: ${id}`);

  const next = JSON.parse(JSON.stringify(tree));
  const node = next.nodes[id];
  const p = isPlainObject(patch) ? patch : {};

  if (typeof p.status === "string") node.status = p.status;
  if (typeof p.attempts_delta === "number") node.attempts = Math.max(0, node.attempts + p.attempts_delta);
  if (isPlainObject(p.providers)) {
    if (typeof p.providers.generator_provider === "string" || p.providers.generator_provider === null) {
      node.generator_provider = p.providers.generator_provider;
    }
    if (typeof p.providers.review_provider === "string" || p.providers.review_provider === null) {
      node.review_provider = p.providers.review_provider;
    }
  }
  if (isPlainObject(p.timing)) {
    if (typeof p.timing.started_at === "string" || p.timing.started_at === null) node.started_at = p.timing.started_at;
    if (typeof p.timing.finished_at === "string" || p.timing.finished_at === null) node.finished_at = p.timing.finished_at;
  }
  if (isPlainObject(p.checkpoint_shas)) {
    if (typeof p.checkpoint_shas.before === "string" || p.checkpoint_shas.before === null) {
      node.checkpoint_before_sha = p.checkpoint_shas.before;
    }
    if (typeof p.checkpoint_shas.commit === "string" || p.checkpoint_shas.commit === null) {
      node.checkpoint_commit_sha = p.checkpoint_shas.commit;
    }
  }
  if (Array.isArray(p.raw_outputs)) {
    node.raw_outputs = unique(node.raw_outputs.concat(p.raw_outputs.map((x) => String(x))).filter(Boolean));
  }
  if (Array.isArray(p.errors)) {
    node.errors = node.errors.concat(p.errors);
  }
  next.updated_at = nowIso();
  return next;
}

function dependencySatisfied(status) {
  return status === "done" || status === "skipped";
}

function getNextExecutableSubtask(planTree) {
  const tree = validatePlanTree(planTree);
  for (const id of tree.order) {
    const node = tree.nodes[id];
    if (node.status !== "pending") continue;
    const ok = node.dependencies.every((dep) => dependencySatisfied(tree.nodes[dep]?.status));
    if (ok) return node;
  }
  return null;
}

function computeDownstream(planTree, startId) {
  const tree = validatePlanTree(planTree);
  const rev = new Map(Object.keys(tree.nodes).map((id) => [id, []]));
  for (const id of Object.keys(tree.nodes)) {
    for (const dep of tree.nodes[id].dependencies) {
      if (rev.has(dep)) rev.get(dep).push(id);
    }
  }
  const out = new Set();
  const q = [startId];
  while (q.length) {
    const cur = q.shift();
    for (const nxt of rev.get(cur) ?? []) {
      if (out.has(nxt)) continue;
      out.add(nxt);
      q.push(nxt);
    }
  }
  return out;
}

async function replanFromFailure({
  instruction,
  globalContext,
  planTree,
  failedSubtask,
  failureContext,
  claudeProvider,
  limits
}) {
  const tree = validatePlanTree(planTree);
  const maxReplans = Number.isFinite(tree.limits?.max_replans) ? tree.limits.max_replans : 2;
  if ((tree.replans ?? 0) >= maxReplans) {
    const next = JSON.parse(JSON.stringify(tree));
    next.replans = (next.replans ?? 0) + 1;
    next.updated_at = nowIso();
    return next;
  }

  const failedId = typeof failedSubtask === "string" ? failedSubtask : String(failedSubtask?.id ?? "");
  if (!failedId || !tree.nodes[failedId]) {
    const next = JSON.parse(JSON.stringify(tree));
    next.replans = (next.replans ?? 0) + 1;
    next.updated_at = nowIso();
    return next;
  }

  const downstream = computeDownstream(tree, failedId);
  const rewriteSet = new Set([failedId, ...downstream]);

  const doneIds = tree.order.filter((id) => tree.nodes[id].status === "done");
  const doneSummary = doneIds
    .map((id) => `- ${id}: ${tree.nodes[id].description}`)
    .join("\n");

  const newLimits = limits ?? tree.limits;
  const remainingBudget = Math.max(
    1,
    (Number.isFinite(newLimits?.max_subtasks) ? newLimits.max_subtasks : 12) - doneIds.length
  );

  // CI/offline hook for replan too
  const mock = await readMockJsonFromEnv({
    singleVar: "AGENT_BRIDGE_REPLAN_RESPONSE_FILE",
    listVar: "AGENT_BRIDGE_REPLAN_RESPONSE_FILES",
    listIdxVar: "AGENT_BRIDGE_REPLAN_RESPONSE_FILES_IDX"
  }).catch(() => null);
  if (mock) {
    const arr = Array.isArray(mock) ? mock : Array.isArray(mock?.subtasks) ? mock.subtasks : null;
    if (arr) {
      const partial = normalizePlanArrayToPartialNodes(arr.slice(0, remainingBudget), {
        ...newLimits,
        max_subtasks: remainingBudget
      });
      return mergeReplannedTree(tree, partial, doneIds, rewriteSet);
    }
  }

  if (!claudeProvider || typeof claudeProvider.generateJson !== "function") {
    const next = JSON.parse(JSON.stringify(tree));
    next.replans = (next.replans ?? 0) + 1;
    next.updated_at = nowIso();
    // mark rewrite region as failed so orchestrator can abort deterministically
    for (const id of rewriteSet) {
      if (next.nodes[id] && next.nodes[id].status === "pending") next.nodes[id].status = "failed";
    }
    return next;
  }

  const schema = buildPlanSchemaJson();
  const system = [
    "You are a senior engineering planner.",
    "Some subtasks have already completed successfully. Keep them as-is.",
    "Replan the remaining work into a small DAG of subtasks.",
    `Return at most ${remainingBudget} subtasks.`,
    "Use ids like r1_s1, r1_s2, ... (unique).",
    "dependencies may reference completed subtask ids and/or ids within your returned subtasks.",
    "target_files must be workspace-relative paths (no absolute paths, no '..', no '.git').",
    "Return JSON matching the provided schema exactly."
  ].join("\n");

  const user = [
    "ORIGINAL INSTRUCTION:",
    String(instruction ?? ""),
    "",
    "COMPLETED SUBTASKS:",
    doneSummary || "(none)",
    "",
    "FAILED SUBTASK:",
    `${failedId}: ${tree.nodes[failedId].description}`,
    "",
    "FAILURE CONTEXT:",
    typeof failureContext === "string" ? failureContext : JSON.stringify(failureContext ?? {}, null, 2),
    "",
    "GLOBAL CONTEXT:",
    String(globalContext ?? "")
  ].join("\n");

  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const json = await claudeProvider.generateJson({ system, user, schema });
      const arr = Array.isArray(json) ? json : json?.subtasks;
      if (!Array.isArray(arr)) throw new Error("planner output missing subtasks array");
      const partial = normalizePlanArrayToPartialNodes(arr.slice(0, remainingBudget), {
        ...newLimits,
        max_subtasks: remainingBudget
      });
      return mergeReplannedTree(tree, partial, doneIds, rewriteSet);
    } catch (e) {
      lastErr = e;
    }
  }

  const next = JSON.parse(JSON.stringify(tree));
  next.replans = (next.replans ?? 0) + 1;
  next.updated_at = nowIso();
  next.nodes[failedId].errors = next.nodes[failedId].errors.concat([
    {
      attempt: 0,
      stage: "replan",
      message: lastErr?.message ?? "replan failed",
      details: null
    }
  ]);
  return next;
}

function mergeReplannedTree(oldTree, partialNew, doneIds, rewriteSet) {
  const next = JSON.parse(JSON.stringify(oldTree));
  const oldIds = new Set(Object.keys(next.nodes));
  const rewrite = rewriteSet instanceof Set ? rewriteSet : new Set();

  const keptNodes = {};
  const keptOrder = [];
  for (const id of next.order) {
    const node = next.nodes[id];
    if (!node) continue;
    if (node.status === "done" || !rewrite.has(id)) {
      keptNodes[id] = node;
      keptOrder.push(id);
    }
  }

  const mapping = new Map();
  const newNodes = {};
  for (const id of partialNew.order) {
    const base = partialNew.nodes[id];
    if (!base) continue;
    let newId = id;
    if (oldIds.has(newId) || keptNodes[newId]) {
      newId = `r${(next.replans ?? 0) + 1}_${id}`;
    }
    mapping.set(id, newId);
    newNodes[newId] = { ...base, id: newId };
  }

  for (const id of Object.keys(newNodes)) {
    newNodes[id].dependencies = unique(
      (newNodes[id].dependencies ?? []).map((d) => mapping.get(d) ?? d).filter(Boolean)
    );
  }

  next.nodes = { ...keptNodes, ...newNodes };
  next.order = [...keptOrder, ...Object.keys(newNodes).filter((id) => !keptOrder.includes(id))];
  
  // Safety mechanism: enforce sequential dependencies for same-file edits in merged tree
  enforceSequentialDependencies(next.nodes, next.order);
  
  next.replans = (next.replans ?? 0) + 1;
  next.updated_at = nowIso();
  return validatePlanTree(next);
}

module.exports = {
  analyzeDifficulty,
  extractLikelyPaths,
  evaluateComplexity,
  optimizeContext,
  prepareSubtasks,
  buildSingleNodePlanTree,
  validatePlanTree,
  decomposeTask,
  updatePlanState,
  getNextExecutableSubtask,
  replanFromFailure
};