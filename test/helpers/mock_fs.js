/**
 * In-memory filesystem mock for unit tests.
 *
 * Simulates a flat in-memory directory tree.
 * Does NOT enforce real path safety — use the real fsTools.resolveInWorkspace
 * in tests to catch unsafe paths before passing to this mock.
 *
 * Usage:
 *   const mockFs = createMockFs({ "foo/bar.txt": "content" });
 *   await mockFs.mkdir("/foo", { recursive: true });
 *   await mockFs.writeFile("/foo/bar.txt", "hello");
 *   const content = await mockFs.readFile("/foo/bar.txt");
 */

function createMockFs(initialFiles = {}) {
  // tree is a nested Map: dirname → { subdirname: Map | "file-content" }
  const tree = new Map();

  // Seed with initial files
  for (const [filePath, content] of Object.entries(initialFiles)) {
    const parts = normalizeParts(filePath);
    setFileAt(parts, String(content));
  }

  function normalizeParts(p) {
    return p.split("/").filter(Boolean);
  }

  // Navigate to parent dir Map, returning { node, key } where node is parent Map
  function navigateToParent(parts) {
    let node = tree;
    for (let i = 0; i < parts.length - 1; i += 1) {
      let child = node.get(parts[i]);
      if (!child) {
        child = new Map();
        node.set(parts[i], child);
      } else if (typeof child === "string") {
        // File where directory expected — treat as non-existent
        child = new Map();
        node.set(parts[i], child);
      }
      node = child;
    }
    return { node, key: parts[parts.length - 1] };
  }

  function setFileAt(parts, content) {
    if (parts.length === 0) return;
    const { node, key } = navigateToParent(parts);
    node.set(key, String(content));
  }

  function getFileAt(parts) {
    if (parts.length === 0) return null;
    let node = tree;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const child = node.get(parts[i]);
      if (!child || typeof child === "string") return null;
      node = child;
    }
    return node.get(parts[parts.length - 1]) ?? null;
  }

  function hasDirAt(parts) {
    if (parts.length === 0) return true;
    let node = tree;
    for (let i = 0; i < parts.length; i += 1) {
      const child = node.get(parts[i]);
      if (!child) return false;
      if (typeof child === "string") return false;
      node = child;
    }
    return true;
  }

  function deleteAt(parts) {
    if (parts.length === 0) return;
    let node = tree;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const child = node.get(parts[i]);
      if (!child || typeof child === "string") return;
      node = child;
    }
    node.delete(parts[parts.length - 1]);
  }

  return {
    /** @param {string} p @param {object} opts */
    async mkdir(p, opts) {
      const parts = normalizeParts(p);
      if (parts.length === 0) return;
      let node = tree;
      for (const part of parts) {
        let child = node.get(part);
        if (!child) {
          child = new Map();
          node.set(part, child);
        } else if (typeof child === "string") {
          throw Object.assign(new Error(`ENOTDIR: not a directory`), { code: "ENOTDIR" });
        }
        node = child;
      }
    },

    /** @param {string} p @param {string} data @param {string} enc */
    async writeFile(p, data, enc) {
      const parts = normalizeParts(p);
      if (parts.length === 0) return;
      // Ensure parent dirs exist
      if (parts.length > 1) {
        await this.mkdir(parts.slice(0, -1).join("/"), { recursive: true });
      }
      setFileAt(parts, String(data));
    },

    /** @param {string} p @param {string} enc */
    async readFile(p, enc) {
      const parts = normalizeParts(p);
      const content = getFileAt(parts);
      if (typeof content !== "string") {
        const err = new Error(`ENOENT: no such file`);
        err.code = "ENOENT";
        throw err;
      }
      return content;
    },

    /** @param {string} p */
    async stat(p) {
      const parts = normalizeParts(p);
      const content = getFileAt(parts);
      if (typeof content === "string") {
        return { isFile: () => true, isDirectory: () => false, size: content.length };
      }
      if (hasDirAt(parts)) {
        return { isFile: () => false, isDirectory: () => true, size: 0 };
      }
      const err = new Error(`ENOENT: no such file or directory`);
      err.code = "ENOENT";
      throw err;
    },

    /** @param {string} p */
    async access(p) {
      const parts = normalizeParts(p);
      const content = getFileAt(parts);
      if (typeof content === "string" || hasDirAt(parts)) return;
      const err = new Error(`ENOENT`);
      err.code = "ENOENT";
      throw err;
    },

    /** @param {string} p @param {object} opts */
    async unlink(p, opts) {
      const parts = normalizeParts(p);
      const content = getFileAt(parts);
      if (typeof content !== "string") {
        const err = new Error(`ENOENT`);
        err.code = "ENOENT";
        throw err;
      }
      deleteAt(parts);
    },

    /** @param {string} p @param {object} opts */
    async rm(p, opts) {
      await this.unlink(p);
    },

    /** @param {string} p @param {string} to */
    async rename(p, to) {
      const parts = normalizeParts(p);
      const content = getFileAt(parts);
      if (typeof content !== "string") {
        const err = new Error(`ENOENT`);
        err.code = "ENOENT";
        throw err;
      }
      const toParts = normalizeParts(to);
      // Ensure target parent dir
      if (toParts.length > 1) {
        await this.mkdir(toParts.slice(0, -1).join("/"), { recursive: true });
      }
      setFileAt(toParts, content);
      deleteAt(parts);
    },

    /**
     * Snapshot current tree state for comparison.
     * @returns {Map}
     */
    snapshot() {
      return deepClone(tree);
    },

    /**
     * Restore a previous snapshot.
     * @param {Map} snap
     */
    restore(snap) {
      tree.clear();
      for (const [k, v] of snap) {
        tree.set(k, deepClone(v));
      }
    }
  };
}

function deepClone(val) {
  if (val instanceof Map) {
    const m = new Map();
    for (const [k, v] of val) m.set(k, deepClone(v));
    return m;
  }
  return val;
}

module.exports = { createMockFs };
