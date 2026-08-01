const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

function findBrowserExecutable() {
  if (process.env.CHROME_PATH) {
    return fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  }

  const command = process.platform === "win32" ? "where.exe" : "which";
  const candidates = process.platform === "win32"
    ? ["chrome.exe", "msedge.exe", "chromium.exe"]
    : ["google-chrome", "chromium", "chromium-browser", "microsoft-edge"];

  for (const candidate of candidates) {
    const result = spawnSync(command, [candidate], {
      encoding: "utf8",
      windowsHide: true
    });
    if (result.status === 0) {
      const executable = result.stdout.split(/\r?\n/).find((line) => line.trim());
      if (executable) {
        return executable.trim();
      }
    }
  }

  return null;
}

module.exports = { findBrowserExecutable };
