/**
 * Unified mock provider for unit tests.
 * Shapes responses in the same structure as the real adapter providers
 * (ollama, openai, claude_cli).
 *
 * Usage:
 *   const mock = createMockProvider({ mockText: "hello world" });
 *   const mock = createMockProvider({ mockToolCalls: [...] });
 *   const mock = createMockProvider({ mockJson: { subtasks: [...] } });
 *
 * Sequential mode (for multi-call tests):
 *   const mocks = [
 *     createMockProvider({ mockText: "response 1" }),
 *     createMockProvider({ mockText: "response 2" }),
 *   ];
 *   const roundRobin = roundRobinProviders(mocks);
 */

function createMockProvider({ mockText, mockToolCalls, mockJson, throwError } = {}) {
  return {
    /**
     * @param {string} prompt
     * @returns {Promise<string|object>}
     */
    async generateCode(prompt) {
      if (throwError) throw throwError;
      if (mockToolCalls) {
        return { tool_calls: mockToolCalls };
      }
      if (mockJson) return mockJson;
      if (mockText !== undefined) return String(mockText);
      return "";
    },

    /**
     * @param {{ system: string, user: string, schema: string }} opts
     * @returns {Promise<object>}
     */
    async generateJson({ system, user, schema }) {
      if (throwError) throw throwError;
      if (mockJson) return mockJson;
      // Fallback: try to parse mockText as JSON
      if (mockText !== undefined) {
        try {
          return JSON.parse(String(mockText));
        } catch {
          return {};
        }
      }
      return {};
    },

    /** @param {string} prompt @returns {Promise<string>} */
    async generate(prompt) {
      if (throwError) throw throwError;
      return String(mockText ?? "");
    },

    /** @param {object} opts @returns {Promise<object>} */
    async callOllama(opts) {
      if (throwError) throw throwError;
      if (mockToolCalls) return { tool_calls: mockToolCalls };
      return { response: String(mockText ?? "") };
    },

    /** @param {object} opts @returns {Promise<object>} */
    async callOpenAI(opts) {
      if (throwError) throw throwError;
      if (mockToolCalls) return { tool_calls: mockToolCalls };
      return String(mockText ?? "");
    }
  };
}

/**
 * Round-robin provider that cycles through a list of mock providers.
 * Useful for tests that make sequential calls (e.g., plan → generate → replan).
 */
function roundRobinProviders(providers) {
  let idx = 0;
  return {
    generateCode: async (prompt) => {
      const p = providers[idx % providers.length];
      idx += 1;
      return p.generateCode(prompt);
    },
    generateJson: async (opts) => {
      const p = providers[idx % providers.length];
      idx += 1;
      return p.generateJson(opts);
    },
    generate: async (prompt) => {
      const p = providers[idx % providers.length];
      idx += 1;
      return p.generate(prompt);
    }
  };
}

module.exports = { createMockProvider, roundRobinProviders };
