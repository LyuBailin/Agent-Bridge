const fs = require("node:fs/promises");
const path = require("node:path");
const { toPosixPath, assertSafeRelPath } = require("../shared/path");

function resolveInWorkspace(workspaceDir, relPath) {
  const safeRel = assertSafeRelPath(relPath);
  const abs = path.resolve(workspaceDir, safeRel);
  const ws = path.resolve(workspaceDir) + path.sep;
  if (!abs.startsWith(ws)) {
    throw new Error(
      `Path "${relPath}" is outside workspace. Use paths relative to "./workspace/" - e.g., "backend/" not "backend" or "../backend"`
    );
  }
  return { safeRel, abs };
}

function isWithinWorkspace(workspaceDir, relPath) {
  try {
    const safeRel = assertSafeRelPath(relPath);
    const abs = path.resolve(workspaceDir, safeRel);
    const ws = path.resolve(workspaceDir) + path.sep;
    return abs.startsWith(ws);
  } catch {
    return false;
  }
}

async function listProjectTree(workspaceDir) {
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walk(full)));
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
    return results;
  }

  const filesAbs = await walk(workspaceDir).catch((err) => {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return [];
    throw err;
  });

  const filesRel = filesAbs
    .map((abs) => toPosixPath(path.relative(workspaceDir, abs)))
    .filter((p) => p && p !== "." && !p.startsWith("../"));
  filesRel.sort();
  return filesRel;
}

async function getFileContext(workspaceDir, relPath, maxBytes) {
  const { abs } = resolveInWorkspace(workspaceDir, relPath);
  const buf = await fs.readFile(abs).catch((err) => {
    if (err && err.code === "ENOENT") return Buffer.from("", "utf8");
    throw err;
  });

  let text = buf.toString("utf8");
  let truncated = false;
  if (typeof maxBytes === "number" && maxBytes > 0 && buf.length > maxBytes) {
    text = buf.subarray(0, maxBytes).toString("utf8");
    truncated = true;
  }

  const lines = text.split(/\r?\n/);
  const numbered = lines.map((line, idx) => `${idx + 1}: ${line}`).join("\n");
  const header = truncated
    ? `FILE: ${relPath} (TRUNCATED to ${maxBytes} bytes)`
    : `FILE: ${relPath}`;
  return `${header}\n${numbered}\n`;
}

function extAllowed(relPath, includeExts) {
  const ext = path.extname(relPath).slice(1).toLowerCase();
  if (!ext) return false;
  return Array.isArray(includeExts) ? includeExts.includes(ext) : true;
}

async function collectContext(workspaceDir, limits) {
  const maxFileBytes = limits?.max_file_bytes ?? 32768;
  const maxFiles = limits?.max_files ?? 60;
  const includeExts = limits?.include_exts ?? [
    "js",
    "ts",
    "json",
    "md",
    "txt",
    "yml",
    "yaml",
    "toml"
  ];
  const minContext = limits?.minContext ?? false;

  const tree = await listProjectTree(workspaceDir);

  const treeText =
    tree.length === 0
      ? "Project Tree (workspace is empty)\n"
      : `Project Tree (${tree.length} files)\n` +
        tree.map((p) => `- ${p}`).join("\n") +
        "\n";

  const selected = [];
  for (const rel of tree) {
    if (selected.length >= maxFiles) break;
    if (!extAllowed(rel, includeExts)) continue;
    selected.push(rel);
  }

  // minContext mode: skip file contents, only return tree structure
  if (minContext) {
    return treeText;
  }

  const fileContexts = [];
  for (const rel of selected) {
    fileContexts.push(await getFileContext(workspaceDir, rel, maxFileBytes));
  }

  return `${treeText}\n${fileContexts.join("\n")}`;
}

async function updateFile(workspaceDir, relPath, newContent) {
  const { abs } = resolveInWorkspace(workspaceDir, relPath);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, newContent, "utf8");
}

function stripJsExt(p) {
  return p.replace(/\.(js|ts|mjs|cjs|jsx|tsx)$/i, "");
}

function normalizeImportTarget(fromFile, target) {
  const t = String(target ?? "").trim();
  if (!t.startsWith("./") && !t.startsWith("../")) return null;
  const fromDir = path.dirname(fromFile);
  const joined = path.normalize(path.join(fromDir, t));
  if (path.isAbsolute(joined)) return null;
  if (joined.split(path.sep).includes("..")) return null;
  return joined;
}

async function extractImportGraph(workspaceDir, opts = {}) {
  const includeExts = Array.isArray(opts.includeExts)
    ? opts.includeExts
    : ["js", "ts", "mjs", "cjs"];
  const maxFiles = Number.isFinite(opts.maxFiles) ? opts.maxFiles : 2000;
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 200_000;

  const tree = await listProjectTree(workspaceDir);
  const candidates = tree.filter((p) => includeExts.includes(path.extname(p).slice(1).toLowerCase()));

  const edges = {};
  const reverseEdges = {};

  function addEdge(from, to) {
    if (!edges[from]) edges[from] = [];
    edges[from].push(to);
    if (!reverseEdges[to]) reverseEdges[to] = [];
    reverseEdges[to].push(from);
  }

  const importRe = /\bimport\s+(?:(?:type\s+)?\{[^}]+\}\s+from\s+|default\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  const requireRe = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
  const exportFromRe = /export\s+\{[^}]+\}\s+from\s+["']([^"']+)["']/g;

  let processed = 0;
  for (const rel of candidates) {
    if (processed >= maxFiles) break;
    processed += 1;

    const { abs } = resolveInWorkspace(workspaceDir, rel);
    const buf = await fs.readFile(abs).catch((err) => {
      if (err && err.code === "ENOENT") return null;
      throw err;
    });
    if (buf === null) continue;

    const text = buf.length > maxBytes ? buf.subarray(0, maxBytes).toString("utf8") : buf.toString("utf8");
    const from = toPosixPath(rel);

    const targets = [];
    for (const re of [importRe, dynamicImportRe, exportFromRe, requireRe]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        targets.push(m[1]);
      }
    }

    for (const t of targets) {
      const normalized = normalizeImportTarget(rel, t);
      if (!normalized) continue;
      const toNoExt = stripJsExt(toPosixPath(normalized));

      // Map to an existing file when possible.
      const possible = [
        `${toNoExt}.js`,
        `${toNoExt}.ts`,
        `${toNoExt}.mjs`,
        `${toNoExt}.cjs`,
        `${toNoExt}/index.js`,
        `${toNoExt}/index.ts`
      ];

      let resolvedTo = null;
      for (const p of possible) {
        if (tree.includes(p)) {
          resolvedTo = p;
          break;
        }
      }
      if (!resolvedTo) continue;
      addEdge(from, resolvedTo);
    }
  }

  // Dedup
  for (const k of Object.keys(edges)) edges[k] = Array.from(new Set(edges[k]));
  for (const k of Object.keys(reverseEdges)) reverseEdges[k] = Array.from(new Set(reverseEdges[k]));

  return { edges, reverseEdges };
}

function expandRelatedFiles({ seedFiles, reverseEdges, edges, depth = 1, maxFiles = 20, direction = "both" } = {}) {
  const seeds = Array.isArray(seedFiles) ? seedFiles.map((s) => String(s)).filter(Boolean) : [];
  const rev = reverseEdges && typeof reverseEdges === "object" ? reverseEdges : {};
  const fwd = edges && typeof edges === "object" ? edges : {};
  const d = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 1;
  const cap = Number.isFinite(maxFiles) ? Math.max(1, Math.floor(maxFiles)) : 20;
  const dir = direction === "forward" || direction === "both" ? direction : "reverse";

  const out = new Set(seeds);
  let frontier = seeds.slice();

  for (let level = 0; level < d; level += 1) {
    const next = [];
    for (const f of frontier) {
      const neighbors =
        dir === "forward"
          ? Array.isArray(fwd[f]) ? fwd[f] : []
          : Array.isArray(rev[f]) ? rev[f] : [];
      for (const n of neighbors) {
        if (out.size >= cap) break;
        if (out.has(n)) continue;
        out.add(n);
        next.push(n);
      }
      if (out.size >= cap) break;
    }
    frontier = next;
    if (frontier.length === 0) break;
  }

  // For 'both' direction, run a second pass for the opposite direction
  if (dir === "both") {
    const opposite = "reverse";
    const out2 = new Set(Array.from(out));
    let frontier2 = Array.from(out);

    for (let level = 0; level < d; level += 1) {
      const next = [];
      for (const f of frontier2) {
        const neighbors = Array.isArray(rev[f]) ? rev[f] : [];
        for (const n of neighbors) {
          if (out2.size >= cap) break;
          if (out2.has(n)) continue;
          out2.add(n);
          next.push(n);
        }
        if (out2.size >= cap) break;
      }
      frontier2 = next;
      if (frontier2.length === 0) break;
    }

    return Array.from(out2);
  }

  return Array.from(out);
}

module.exports = {
  assertSafeRelPath,
  resolveInWorkspace,
  isWithinWorkspace,
  listProjectTree,
  getFileContext,
  collectContext,
  updateFile,
  extractImportGraph,
  expandRelatedFiles
};
