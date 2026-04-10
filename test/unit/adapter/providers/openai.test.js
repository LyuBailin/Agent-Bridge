const test = require("node:test");
const assert = require("node:assert/strict");

const { callOpenAI } = require("../../../../src/core/adapter/providers/openai");

function mockFetch(responseJson, ok = true) {
  return async function mockFetch(url, opts) {
    return {
      ok,
      async text() { return JSON.stringify(responseJson); },
      async json() { return responseJson; }
    };
  };
}

test("callOpenAI: throws when api key missing", async () => {
  await assert.rejects(
    () => callOpenAI({ system: "s", user: "u" }, {}),
    /Missing OpenAI API key/
  );
});

test("callOpenAI: returns text from message.content", async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetch({
    choices: [{ message: { content: "generated text" } }]
  });

  try {
    const result = await callOpenAI(
      { system: "sys", user: "hello" },
      { api_key: "sk-test", base_url: "https://api.openai.com/v1", model: "gpt-4" },
      false
    );
    assert.equal(result, "generated text");
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOpenAI: function-calling returns tool_calls", async () => {
  const toolCalls = [{ id: "call_1", function: { name: "mkdir", arguments: JSON.stringify({ path: "dir" }) } }];
  const originalFetch = global.fetch;
  global.fetch = mockFetch({
    choices: [{ message: { content: null, tool_calls: toolCalls } }]
  });

  try {
    const result = await callOpenAI(
      { system: "s", user: "u" },
      { api_key: "sk-test", model: "gpt-4" },
      true
    );
    assert.deepEqual(result.tool_calls, toolCalls);
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOpenAI: throws on non-ok response", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, async text() { return "rate limit"; } });

  try {
    await assert.rejects(
      () => callOpenAI({ system: "s", user: "u" }, { api_key: "sk-test", model: "gpt-4" }, false),
      /OpenAI API error/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOpenAI: throws when no content and no tool_calls", async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetch({ choices: [{ message: { content: null } }] });

  try {
    await assert.rejects(
      () => callOpenAI({ system: "s", user: "u" }, { api_key: "sk-test", model: "gpt-4" }, false),
      /no text output/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOpenAI: sends Authorization header", async () => {
  const originalFetch = global.fetch;
  let capturedHeaders;
  global.fetch = async (url, opts) => {
    capturedHeaders = opts.headers;
    return mockFetch({ choices: [{ message: { content: "ok" } }] })();
  };

  try {
    await callOpenAI({ system: "s", user: "u" }, { api_key: "sk-secret", model: "gpt-4" }, false);
    assert.equal(capturedHeaders.Authorization, "Bearer sk-secret");
  } finally {
    global.fetch = originalFetch;
  }
});

test("callOpenAI: includes tools in body when useFunctionCalling=true", async () => {
  const originalFetch = global.fetch;
  let capturedBody;
  global.fetch = async (url, opts) => {
    capturedBody = JSON.parse(opts.body);
    return mockFetch({ choices: [{ message: { content: "ok" } }] })();
  };

  try {
    await callOpenAI({ system: "s", user: "u" }, { api_key: "sk-test", model: "gpt-4" }, true);
    assert.ok(Array.isArray(capturedBody.tools));
    assert.equal(capturedBody.tool_choice, "auto");
  } finally {
    global.fetch = originalFetch;
  }
});
