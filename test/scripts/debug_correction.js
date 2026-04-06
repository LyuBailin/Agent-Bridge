#!/usr/bin/env node
// Debug script to trace self-correction logic

const fs = require('fs');
const path = require('path');

// Mock the key functions using sync versions
function readMockTextFromEnv({ listVar, listIdxVar }) {
  const mockList = process.env[listVar];
  if (mockList) {
    const files = mockList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (files.length > 0) {
      const idx = Math.min(Number.parseInt(process.env[listIdxVar] ?? "0", 10) || 0, files.length - 1);
      const abs = path.resolve(files[idx]);
      process.env[listIdxVar] = String(idx + 1);readMockTextFromEnv
      console.log(`[DEBUG] readMockTextFromEnv: idx=${idx}, file=${files[idx]}`);
      return fs.readFileSync(abs, "utf8");
    }
  }
  return null;
}

// Simulate the self-correction logic
async function simulateSelfCorrection() {
  // Setup: two mock files
  const p1 = "no blocks here";
  const p2 = "```sr\nFILE: b.txt\nSEARCH:\n<<<\n\n>>>\nREPLACE:\n<<<\nok\n>>>\n```";

  const tmpDir = '/tmp/debug_correction';
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'mock1.txt'), p1);
  fs.writeFileSync(path.join(tmpDir, 'mock2.txt'), p2);

  process.env.AGENT_BRIDGE_RESPONSE_FILES = `${tmpDir}/mock1.txt,${tmpDir}/mock2.txt`;
  process.env.AGENT_BRIDGE_RESPONSE_FILES_IDX = "0";

  // Simulate the loop
  let attempt = 1;
  let correctionAttempted = false;
  let correctionFailed = false;
  let parseSuccess = false;

  let rawResponse;

  // First generate
  console.log(`[DEBUG] Attempt ${attempt}: calling generateCode (first time)`);
  rawResponse = readMockTextFromEnv({
    singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
    listVar: "AGENT_BRIDGE_RESPONSE_FILES",
    listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
  });
  console.log(`[DEBUG] First generate returned: ${rawResponse ? rawResponse.substring(0, 50) + '...' : 'null'}`);

  // Simulate parse failing
  let parseFailed = true;
  if (parseFailed) {
    if (correctionAttempted) {
      console.log(`[DEBUG] Correction already attempted, would continue to next attempt`);
      correctionFailed = true;
      parseSuccess = true; // signal exit
    } else {
      console.log(`[DEBUG] First parse failed, attempting correction...`);
      correctionAttempted = true;

      // Correction generate
      console.log(`[DEBUG] Attempt ${attempt}: calling generateCode (correction)`);
      rawResponse = readMockTextFromEnv({
        singleVar: "AGENT_BRIDGE_RESPONSE_FILE",
        listVar: "AGENT_BRIDGE_RESPONSE_FILES",
        listIdxVar: "AGENT_BRIDGE_RESPONSE_FILES_IDX"
      });
      console.log(`[DEBUG] Correction generate returned: ${rawResponse ? rawResponse.substring(0, 50) + '...' : 'null'}`);

      // Simulate parse succeeding after correction
      parseSuccess = true;
      console.log(`[DEBUG] Correction parse succeeded`);
    }
  }

  // Check final state
  console.log(`[DEBUG] Final state: correctionAttempted=${correctionAttempted}, correctionFailed=${correctionFailed}, parseSuccess=${parseSuccess}`);
  console.log(`[DEBUG] idx after corrections: ${process.env.AGENT_BRIDGE_RESPONSE_FILES_IDX}`);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

simulateSelfCorrection().catch(console.error);