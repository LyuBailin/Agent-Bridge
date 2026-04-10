const TOOLS_SCHEMA = require("../schema").TOOLS_SCHEMA;
const { parseStructuredTextToToolCalls } = require("../parser");

async function callOllama(prompt, modelConfig = {}, useFunctionCalling = false) {
  const baseUrl = modelConfig?.base_url ?? "http://localhost:11434";
  const model = modelConfig?.model ?? "qwen-2.5-coder:14b";
  const temperature = typeof modelConfig?.temperature === "number" ? modelConfig.temperature : undefined;

  let url;
  let body;

  if (useFunctionCalling) {
    url = `${String(baseUrl).replace(/\/+$/, "")}/api/chat`;
    body = {
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user }
      ],
      stream: false,
      tools: TOOLS_SCHEMA,
      ...(temperature !== undefined ? { temperature } : {})
    };
  } else {
    url = `${String(baseUrl).replace(/\/+$/, "")}/api/generate`;
    body = {
      model,
      prompt: `System: ${prompt.system}\n\nUser: ${prompt.user}`,
      stream: false,
      ...(temperature !== undefined ? { temperature } : {})
    };
  }

  const controller = new AbortController();
  const timeoutMs = 120000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Ollama API error ${res.status}: ${text.slice(0, 2000)}`);
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Failed to parse Ollama JSON response: ${text.slice(0, 2000)}`);
    }

    if (useFunctionCalling) {
      const message = json.message || json;
      if (message?.tool_calls && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
        return { tool_calls: message.tool_calls };
      }
      // Ollama doesn't natively support tool_calls - try parsing text output into tool_calls format
      const textContent = message?.content || json.response;
      if (textContent && typeof textContent === "string") {
        const toolCalls = parseStructuredTextToToolCalls(textContent);
        if (toolCalls.length > 0) {
          return { tool_calls: toolCalls };
        }
      }
      if (!textContent) {
        throw new Error("Function calling requested but no tool_calls returned and no text output");
      }
      // If allowFallback is true, return the text content as a fallback
      // The caller will handle parsing it as text-based sr/op blocks
      if (modelConfig?.allowFallback) {
        return textContent;
      }
      throw new Error(
        "Function calling requested but model returned no tool_calls. Set allowFallback=true to allow text fallback."
      );
    }

    const out = json.response;
    if (!out) {
      throw new Error("Ollama response contained no text output");
    }
    return out;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { callOllama };
