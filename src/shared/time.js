/**
 * Shared time utilities for Agent Bridge.
 */

function nowIso() {
  // Return ISO format in Beijing time (UTC+8)
  const now = new Date();
  const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString();
}

module.exports = { nowIso };
