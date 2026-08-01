const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { findBrowserExecutable } = require("./browser-path");

const browser = findBrowserExecutable();
const baseUrl = (process.env.SUDOKU_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
assert.ok(browser, "Set CHROME_PATH or add Chrome, Edge, or Chromium to PATH.");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sudoku-browser-smoke-"));
try {
  const result = spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--dump-dom",
    "--virtual-time-budget=5000",
    `${baseUrl}/result.html?difficulty=Easy`
  ], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) {
    throw result.error;
  }
  assert.equal(result.status, 0, result.stderr);
  const dom = result.stdout;
  const cells = (dom.match(/class="[^"]*sudoku-cell/g) || []).length;
  const fixedClues = (dom.match(/class="[^"]*sudoku-cell[^"]*fixed/g) || []).length;
  const numberKeys = (dom.match(/data-number="[1-9]"/g) || []).length;
  const timer = dom.match(/id="game-timer"[^>]*>([^<]+)</)?.[1];

  assert.equal(cells, 81, "The browser should render 81 Sudoku cells.");
  assert.equal(fixedClues, 40, "An Easy puzzle should render 40 fixed clues.");
  assert.equal(numberKeys, 9, "The browser should render number keys 1 through 9.");
  assert.match(timer || "", /^00:0[1-9]$/, "The game timer should be running.");
  assert.match(dom, /data-back-button/, "The result page should contain a Back button.");
  assert.doesNotMatch(dom, /Generating puzzle…/, "Puzzle loading should have completed.");

  const screenshotPath = path.resolve("target", "sudoku-result.png");
  const screenshot = spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--window-size=1440,1200",
    "--virtual-time-budget=3000",
    `--screenshot=${screenshotPath}`,
    `${baseUrl}/result.html?difficulty=Easy`
  ], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true
  });
  if (screenshot.error) {
    throw screenshot.error;
  }
  assert.equal(screenshot.status, 0, screenshot.stderr);
  assert.ok(fs.existsSync(screenshotPath), "The browser screenshot should be created.");

  const mobileScreenshotPath = path.resolve("target", "sudoku-result-mobile.png");
  const mobileScreenshot = spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--window-size=390,1800",
    "--virtual-time-budget=3000",
    `--screenshot=${mobileScreenshotPath}`,
    `${baseUrl}/result.html?difficulty=Easy`
  ], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true
  });
  if (mobileScreenshot.error) {
    throw mobileScreenshot.error;
  }
  assert.equal(mobileScreenshot.status, 0, mobileScreenshot.stderr);
  assert.ok(fs.existsSync(mobileScreenshotPath), "The mobile screenshot should be created.");

  console.log(`Browser smoke passed: ${cells} cells, ${fixedClues} fixed clues, timer ${timer}.`);
  console.log(`Screenshot: ${screenshotPath}`);
  console.log(`Mobile screenshot: ${mobileScreenshotPath}`);
} finally {
  fs.rmSync(profile, { recursive: true, force: true });
}
