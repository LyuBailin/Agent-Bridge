const test = require("node:test");
const assert = require("node:assert/strict");

const { callOllama } = require("../../../../src/core/adapter/providers/ollama");

function mockFetch(responseJson, ok = true) {
  return async function mockFetch(url, opts) {
    return {
      ok,
      async text() { return JSON.stringify(responseJson); },
      async json() { return responseJson; }
    };
  };
}

test("callOllama: generate (non-function-calling) returns text from response", async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetch({ response: "hello world" });

  try {
    const prompt = { system: "sys", user: "hello" };
    const result = await callOllama(prompt, { base_url: "http://localhost:11434", model: "test" }, false);
    assert.equal(result, "hello world");
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOllama: generate throws on non-ok response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, async text() { return "error message"; } });

  try {
    await assert.rejects(
      () => callOllama({ system: "s", user: "u" }, { base_url: "http://x", model: "m" }, false),
      /Ollama API error/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOllama: function-calling returns tool_calls from message.tool_calls", async () => {
  const toolCalls = [{ id: "call_1", function: { name: "search_replace", arguments: "{}" } }];
  const originalFetch = global.fetch;
  global.fetch = mockFetch({ message: { tool_calls: toolCalls } });

  try {
    const result = await callOllama({ system: "s", user: "u" }, { base_url: "http://x", model: "m" }, true);
    assert.deepEqual(result.tool_calls, toolCalls);
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOllama: function-calling falls back to text parsing when no tool_calls (real parser)", async () => {
  // Test that when tool_calls is absent and text parses to valid sr blocks, it succeeds
  const originalFetch = global.fetch;
  // Use sr block content that parseStructuredTextToToolCalls can actually parse
  global.fetch = mockFetch({ message: { content: "```sr\nFILE: a.txt\nSEARCH:\n<<<\n>>>\nREPLACE:\n<<<\nhello\n>>>\n```" } });

  try {
    const result = await callOllama({ system: "s", user: "u" }, { base_url: "http://x", model: "m" }, true);
    assert.equal(result.tool_calls.length, 1);
    assert.equal(result.tool_calls[0].function.name, "search_replace");
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOllama: function-calling throws when no tool_calls and no text", async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetch({ message: {} });

  try {
    await assert.rejects(
      () => callOllama({ system: "s", user: "u" }, { base_url: "http://x", model: "m" }, true),
      /Function calling requested but no tool_calls returned/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOllama: strips trailing slashes from base_url", async () => {
  const originalFetch = global.fetch;
  let capturedUrl;
  global.fetch = async (url) => {
    capturedUrl = url;
    return mockFetch({ response: "ok" })();
  };

  try {
    await callOllama({ system: "s", user: "u" }, { base_url: "http://x///", model: "m" }, false);
    assert.equal(capturedUrl, "http://x/api/generate");
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOllama: passes temperature when provided", async () => {
  const originalFetch = global.fetch;
  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return mockFetch({ response: "ok" })();
  };

  try {
    await callOllama({ system: "s", user: "u" }, { base_url: "http://x", model: "m", temperature: 0.7 }, false);
    assert.equal(capturedBody.temperature, 0.7);
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOllama: omits temperature when not a number", async () => {
  const originalFetch = global.fetch;
  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return mockFetch({ response: "ok" })();
  };

  try {
    await callOllama({ system: "s", user: "u" }, { base_url: "http://x", model: "m", temperature: "high" }, false);
    assert.equal("temperature" in capturedBody, false);
  } finally {
    global.fetch = originalFetch;
  }
});
