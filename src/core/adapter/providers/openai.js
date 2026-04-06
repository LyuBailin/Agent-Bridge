const TOOLS_SCHEMA = require("../schema").TOOLS_SCHEMA;

async function callOpenAI(prompt, modelConfig = {}, useFunctionCalling = false) {
  const baseUrl = modelConfig?.base_url ?? "https://api.openai.com/v1";
  const url = `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;
  const model = modelConfig?.model ?? "gpt-3.5-turbo";
  const apiKey = modelConfig?.api_key;
  const temperature = typeof modelConfig?.temperature === "number" ? modelConfig.temperature : undefined;

  if (!apiKey) {
    throw new Error("Missing OpenAI API key");
  }

  const body = {
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    stream: false,
    ...(temperature !== undefined ? { temperature } : {})
  };

  if (useFunctionCalling) {
    body.tools = TOOLS_SCHEMA;
    body.tool_choice = "auto";
  }

  const controller = new AbortController();
  const timeoutMs = 120000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 2000)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse OpenAI JSON response: ${text.slice(0, 2000)}`);
    }

    const message = json.choices?.[0]?.message;
    if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      return { tool_calls: message.tool_calls };
    }

    const out = message?.content;
    if (!out) {
      throw new Error("OpenAI response contained no text output");
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { callOpenAI };
