const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { findBrowserExecutable } = require("./browser-path");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const browserPath = findBrowserExecutable();
const baseUrl = (process.env.SUDOKU_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
assert.ok(browserPath, "Set CHROME_PATH or add Chrome, Edge, or Chromium to PATH.");

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sudoku-mobile-smoke-"));
  const browser = spawn(browserPath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank"
  ], { stdio: "ignore", windowsHide: true });

  try {
    const activePortFile = path.join(profile, "DevToolsActivePort");
    for (let attempt = 0; attempt < 100 && !fs.existsSync(activePortFile); attempt += 1) {
      await sleep(50);
    }
    assert.ok(fs.existsSync(activePortFile), "Browser debugging port did not become ready.");
    const port = fs.readFileSync(activePortFile, "utf8").split(/\r?\n/)[0];
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const target = targets.find((entry) => entry.type === "page");
    assert.ok(target?.webSocketDebuggerUrl, "Browser page target was not available.");

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });

    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          reject(new Error(message.error.message));
        } else {
          resolve(message.result);
        }
      }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluateValue = async (expression) => {
      const evaluation = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (evaluation.exceptionDetails) {
        throw new Error(evaluation.exceptionDetails.text);
      }
      return evaluation.result.value;
    };

    await send("Page.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1600,
      deviceScaleFactor: 1,
      mobile: true
    });
    await send("Page.navigate", {
      url: `${baseUrl}/result.html?difficulty=Easy`
    });

    let metrics = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await sleep(100);
      const value = await evaluateValue(`JSON.stringify({
          cells: document.querySelectorAll('.sudoku-cell').length,
          fixedClues: document.querySelectorAll('.sudoku-cell.fixed').length,
          numberKeys: document.querySelectorAll('[data-number]').length,
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          minimumKeyHeight: Math.min(...[...document.querySelectorAll('.number-key')].map((button) => button.getBoundingClientRect().height)),
          timer: document.querySelector('#game-timer')?.textContent
        })`);
      metrics = JSON.parse(value);
      if (metrics.cells === 81) {
        break;
      }
    }

    assert.equal(metrics.cells, 81);
    assert.equal(metrics.fixedClues, 40);
    assert.equal(metrics.numberKeys, 9);
    assert.equal(metrics.innerWidth, 390);
    assert.ok(metrics.scrollWidth <= 390, `Mobile page has horizontal overflow: ${metrics.scrollWidth}px.`);
    assert.ok(metrics.minimumKeyHeight >= 48, `Mobile number keys are too small: ${metrics.minimumKeyHeight}px.`);

    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: metrics.scrollHeight,
      deviceScaleFactor: 1,
      mobile: true
    });
    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true
    });
    const screenshotPath = path.resolve("target", "sudoku-result-mobile.png");
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));

    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1600,
      deviceScaleFactor: 1,
      mobile: true
    });

    const fixedCellCheck = JSON.parse(await evaluateValue(`(() => {
      const fixed = document.querySelector('.sudoku-cell.fixed');
      const index = fixed.dataset.index;
      const before = fixed.textContent;
      fixed.click();
      document.querySelector('[data-number="1"]').click();
      return JSON.stringify({ before, after: document.querySelector('[data-index="' + index + '"]').textContent });
    })()`));
    assert.equal(fixedCellCheck.after, fixedCellCheck.before, "A fixed clue changed through the UI.");

    const entryCheck = JSON.parse(await evaluateValue(`(() => {
      const editable = document.querySelector('.sudoku-cell.editable.empty');
      const index = Number(editable.dataset.index);
      editable.click();
      document.querySelector('[data-number="1"]').click();
      const entered = document.querySelector('[data-index="' + index + '"]').textContent;
      document.querySelector('#erase-button').click();
      const erased = document.querySelector('[data-index="' + index + '"]').textContent;
      return JSON.stringify({ index, entered, erased });
    })()`));
    assert.equal(entryCheck.entered, "1");
    assert.equal(entryCheck.erased, "");

    const conflictCheck = JSON.parse(await evaluateValue(`(() => {
      const cells = [...document.querySelectorAll('.sudoku-cell')];
      const related = (first, second) => {
        const r1 = Math.floor(first / 9), c1 = first % 9;
        const r2 = Math.floor(second / 9), c2 = second % 9;
        return r1 === r2 || c1 === c2 || (Math.floor(r1 / 3) === Math.floor(r2 / 3) && Math.floor(c1 / 3) === Math.floor(c2 / 3));
      };
      let target = null;
      let fixed = null;
      for (const editable of cells.filter((cell) => cell.classList.contains('editable'))) {
        const editableIndex = Number(editable.dataset.index);
        fixed = cells.find((cell) => cell.classList.contains('fixed') && related(editableIndex, Number(cell.dataset.index)));
        if (fixed) {
          target = editable;
          break;
        }
      }
      const targetIndex = Number(target.dataset.index);
      const fixedIndex = Number(fixed.dataset.index);
      const duplicate = fixed.textContent;
      target.click();
      document.querySelector('[data-number="' + duplicate + '"]').click();
      window.__smokeEditableIndex = targetIndex;
      return JSON.stringify({
        targetIndex,
        duplicate,
        targetConflict: document.querySelector('[data-index="' + targetIndex + '"]').classList.contains('conflict'),
        fixedConflict: document.querySelector('[data-index="' + fixedIndex + '"]').classList.contains('conflict')
      });
    })()`));
    assert.equal(conflictCheck.targetConflict, true);
    assert.equal(conflictCheck.fixedConflict, true);

    const progressCheck = JSON.parse(await evaluateValue(`(() => {
      document.querySelector('#check-button').click();
      const cell = document.querySelector('[data-index="' + window.__smokeEditableIndex + '"]');
      return JSON.stringify({ incorrect: cell.classList.contains('incorrect'), message: document.querySelector('#grid-message').textContent });
    })()`));
    assert.equal(progressCheck.incorrect, true);
    assert.match(progressCheck.message, /incorrect/);

    const solutionCheck = JSON.parse(await evaluateValue(`(() => {
      window.confirm = () => true;
      const ownValue = document.querySelector('[data-index="' + window.__smokeEditableIndex + '"]').textContent;
      document.querySelector('#solution-button').click();
      window.__smokeSolution = [...document.querySelectorAll('.sudoku-cell')].map((cell) => cell.textContent);
      return JSON.stringify({
        ownValue,
        shownValue: document.querySelector('[data-index="' + window.__smokeEditableIndex + '"]').textContent,
        buttonText: document.querySelector('#solution-button').textContent,
        timer: document.querySelector('#game-timer').textContent
      });
    })()`));
    assert.equal(solutionCheck.buttonText.trim(), "Hide Solution");
    await sleep(1200);
    assert.equal(await evaluateValue("document.querySelector('#game-timer').textContent"), solutionCheck.timer, "Timer continued while the solution was shown.");

    const restoredValue = await evaluateValue(`(() => {
      document.querySelector('#solution-button').click();
      return document.querySelector('[data-index="' + window.__smokeEditableIndex + '"]').textContent;
    })()`);
    assert.equal(restoredValue, solutionCheck.ownValue, "Hiding the solution did not restore the user's entry.");

    const hintCheck = JSON.parse(await evaluateValue(`(() => {
      document.querySelector('#erase-button').click();
      document.querySelector('#hint-button').click();
      document.querySelector('#hint-button').click();
      document.querySelector('#hint-button').click();
      return JSON.stringify({
        hinted: document.querySelectorAll('.sudoku-cell.hinted').length,
        hintsText: document.querySelector('#hints-remaining').textContent.trim(),
        hintDisabled: document.querySelector('#hint-button').disabled
      });
    })()`));
    assert.equal(hintCheck.hinted, 3);
    assert.match(hintCheck.hintsText, /^0 of 3/);
    assert.equal(hintCheck.hintDisabled, true);

    const resetCheck = JSON.parse(await evaluateValue(`(() => {
      document.querySelector('#reset-button').click();
      return JSON.stringify({
        userEntries: document.querySelectorAll('.sudoku-cell.user-entry').length,
        fixedClues: document.querySelectorAll('.sudoku-cell.fixed').length,
        hintsText: document.querySelector('#hints-remaining').textContent.trim(),
        completionHidden: document.querySelector('#completion-panel').hidden,
        timer: document.querySelector('#game-timer').textContent
      });
    })()`));
    assert.equal(resetCheck.userEntries, 0);
    assert.equal(resetCheck.fixedClues, 40);
    assert.match(resetCheck.hintsText, /^0 of 3/);
    assert.equal(resetCheck.completionHidden, true);
    assert.equal(resetCheck.timer, "00:00");

    const completionCheck = JSON.parse(await evaluateValue(`(() => {
      for (let index = 0; index < 81; index += 1) {
        const cell = document.querySelector('[data-index="' + index + '"]');
        if (cell.classList.contains('editable')) {
          cell.click();
          document.querySelector('[data-number="' + window.__smokeSolution[index] + '"]').click();
        }
      }
      return JSON.stringify({
        completionHidden: document.querySelector('#completion-panel').hidden,
        completionText: document.querySelector('#completion-panel').textContent,
        timer: document.querySelector('#game-timer').textContent
      });
    })()`));
    assert.equal(completionCheck.completionHidden, false);
    assert.match(completionCheck.completionText, /Congratulations!/);
    await sleep(1200);
    assert.equal(await evaluateValue("document.querySelector('#game-timer').textContent"), completionCheck.timer, "Timer continued after completion.");

    await evaluateValue("document.querySelector('#generate-button').click()");
    let generatedState = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await sleep(100);
      generatedState = JSON.parse(await evaluateValue(`JSON.stringify({
        busy: document.querySelector('#sudoku-grid').getAttribute('aria-busy'),
        cells: document.querySelectorAll('.sudoku-cell').length,
        userEntries: document.querySelectorAll('.sudoku-cell.user-entry').length,
        hintsText: document.querySelector('#hints-remaining').textContent.trim(),
        completionHidden: document.querySelector('#completion-panel').hidden,
        timer: document.querySelector('#game-timer').textContent
      })`));
      if (generatedState.busy === "false" && generatedState.cells === 81) {
        break;
      }
    }
    assert.equal(generatedState.cells, 81);
    assert.equal(generatedState.userEntries, 0);
    assert.match(generatedState.hintsText, /^3 of 3/);
    assert.equal(generatedState.completionHidden, true);
    assert.match(generatedState.timer, /^00:0[0-1]$/);

    const keyboardCheck = JSON.parse(await evaluateValue(`(() => {
      const cell = [...document.querySelectorAll('.sudoku-cell.editable')]
        .find((candidate) => Number(candidate.dataset.index) % 9 < 8);
      const index = Number(cell.dataset.index);
      cell.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
      const entered = document.querySelector('[data-index="' + index + '"]').textContent;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
      const erased = document.querySelector('[data-index="' + index + '"]').textContent;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const selected = Number(document.querySelector('.sudoku-cell.selected').dataset.index);
      return JSON.stringify({ index, entered, erased, selected });
    })()`));
    assert.equal(keyboardCheck.entered, "1");
    assert.equal(keyboardCheck.erased, "");
    assert.equal(keyboardCheck.selected, keyboardCheck.index + 1);

    await send("Page.navigate", { url: `${baseUrl}/index.html` });
    await sleep(300);
    await evaluateValue(`location.href = '${baseUrl}/difficulty.html'`);
    await sleep(300);
    await evaluateValue("document.querySelector('[data-back-button]').click()");
    await sleep(300);
    assert.equal(await evaluateValue("location.pathname"), "/index.html", "Back did not return to the actual previous page.");

    console.log(`Mobile browser interaction smoke passed: viewport ${metrics.innerWidth}px, scroll width ${metrics.scrollWidth}px, key height ${metrics.minimumKeyHeight}px.`);
    console.log(`Mobile screenshot: ${screenshotPath}`);
    socket.close();
  } finally {
    browser.kill();
    await sleep(200);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may keep a transient profile file open briefly on Windows.
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
