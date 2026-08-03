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
    const javascriptErrors = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown") {
        javascriptErrors.push(message.params.exceptionDetails.text || "Uncaught JavaScript exception");
      }
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

    await sleep(700);

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

    await evaluateValue(`(() => {
      window.__smokeOwnValue = document.querySelector('[data-index="' + window.__smokeEditableIndex + '"]').textContent;
      document.querySelector('#solution-button').click();
    })()`);
    await sleep(100);
    const dialogCheck = JSON.parse(await evaluateValue(`JSON.stringify({
      open: document.querySelector('#confirm-dialog').open,
      title: document.querySelector('#confirm-title').textContent,
      opacity: Number(getComputedStyle(document.querySelector('#confirm-dialog')).opacity)
    })`));
    assert.equal(dialogCheck.open, true);
    assert.match(dialogCheck.title, /Reveal the solution/);
    assert.ok(dialogCheck.opacity > 0.5, "The confirmation dialog did not visibly enter.");
    await evaluateValue(`document.querySelector('#confirm-action').click()`);
    await sleep(100);
    const solutionCheck = JSON.parse(await evaluateValue(`(() => {
      const ownValue = window.__smokeOwnValue;
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

    await evaluateValue(`document.querySelector('#reset-button').click()`);
    await sleep(100);
    await evaluateValue(`document.querySelector('#confirm-action').click()`);
    await sleep(250);
    const resetCheck = JSON.parse(await evaluateValue(`(() => {
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

    await send("Page.reload", { ignoreCache: true });
    let refreshedCells = 0;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await sleep(100);
      refreshedCells = await evaluateValue("document.querySelectorAll('.sudoku-cell').length");
      if (refreshedCells === 81) {
        break;
      }
    }
    assert.equal(refreshedCells, 81, "Refreshing the direct result URL did not restore the puzzle.");

    await sleep(700);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1200,
      deviceScaleFactor: 1,
      mobile: false
    });
    await sleep(200);
    const desktopResultScreenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    const desktopResultScreenshotPath = path.resolve("target", "sudoku-result.png");
    fs.writeFileSync(desktopResultScreenshotPath, Buffer.from(desktopResultScreenshot.data, "base64"));
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 1600,
      deviceScaleFactor: 1,
      mobile: true
    });

    await send("Page.navigate", { url: `${baseUrl}/index.html` });
    await sleep(500);
    const homeCheck = JSON.parse(await evaluateValue(`JSON.stringify({
      sections: ['home', 'generator', 'difficulty', 'features', 'play'].every((id) => Boolean(document.getElementById(id))),
      navLinks: document.querySelectorAll('#primary-nav-links a').length,
      menuVisible: getComputedStyle(document.querySelector('[data-menu-button]')).display !== 'none',
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      motionReady: document.body.classList.contains('motion-ready')
    })`));
    assert.equal(homeCheck.sections, true, "The long-form home sections are missing.");
    assert.equal(homeCheck.navLinks, 5);
    assert.equal(homeCheck.menuVisible, true, "The mobile menu button is not visible.");
    assert.ok(homeCheck.scrollWidth <= homeCheck.innerWidth, "The mobile home page overflows horizontally.");
    assert.equal(homeCheck.motionReady, true);

    const menuCheck = JSON.parse(await evaluateValue(`(() => {
      const button = document.querySelector('[data-menu-button]');
      button.click();
      return JSON.stringify({
        expanded: button.getAttribute('aria-expanded'),
        open: document.querySelector('[data-nav-links]').classList.contains('is-open')
      });
    })()`));
    assert.equal(menuCheck.expanded, "true");
    assert.equal(menuCheck.open, true);

    await evaluateValue(`location.href = '${baseUrl}/difficulty.html'`);
    await sleep(1000);
    const difficultyMotionCheck = JSON.parse(await evaluateValue(`JSON.stringify({
      options: document.querySelectorAll('.difficulty-option').length,
      ready: document.body.classList.contains('motion-ready'),
      visible: [...document.querySelectorAll('.difficulty-option')].every((card) => Number(getComputedStyle(card).opacity) > 0.9)
    })`));
    assert.equal(difficultyMotionCheck.options, 3);
    assert.equal(difficultyMotionCheck.ready, true);
    assert.equal(difficultyMotionCheck.visible, true);

    await evaluateValue("document.querySelector('[data-back-button]').click()");
    await sleep(400);
    assert.equal(await evaluateValue("location.pathname"), "/index.html", "Back did not return to the actual previous page.");

    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }]
    });
    await send("Page.navigate", { url: `${baseUrl}/index.html` });
    await sleep(300);
    const reducedMotionCheck = JSON.parse(await evaluateValue(`JSON.stringify({
      queryMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
      titleDuration: parseFloat(getComputedStyle(document.querySelector('.hero-title')).animationDuration),
      revealTransform: getComputedStyle(document.querySelector('[data-reveal]')).transform,
      revealed: [...document.querySelectorAll('[data-reveal]')].every((element) => Number(getComputedStyle(element).opacity) > 0.9)
    })`));
    assert.equal(reducedMotionCheck.queryMatches, true);
    assert.ok(reducedMotionCheck.titleDuration <= 0.001, `Reduced-motion animation is too long: ${reducedMotionCheck.titleDuration}s.`);
    assert.ok(
      ["none", "matrix(1, 0, 0, 1, 0, 0)"].includes(reducedMotionCheck.revealTransform),
      `Reduced-motion reveal still has a visual transform: ${reducedMotionCheck.revealTransform}`
    );
    assert.equal(reducedMotionCheck.revealed, true);

    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }]
    });
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await send("Page.navigate", { url: `${baseUrl}/index.html` });
    await sleep(500);
    const homeHeroScreenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    const homeHeroScreenshotPath = path.resolve("target", "sudoku-home-hero.png");
    fs.writeFileSync(homeHeroScreenshotPath, Buffer.from(homeHeroScreenshot.data, "base64"));
    await evaluateValue("window.scrollTo({ top: document.querySelector('#generator').offsetTop - 80, behavior: 'auto' })");
    await sleep(700);
    const desktopHomeCheck = JSON.parse(await evaluateValue(`JSON.stringify({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrolled: window.scrollY > 100,
      headerScrolled: document.querySelector('[data-site-header]').classList.contains('is-scrolled'),
      generatorVisible: document.querySelector('.generator-visual').classList.contains('is-visible'),
      boardCells: document.querySelectorAll('.motion-board-cell').length,
      menuHidden: getComputedStyle(document.querySelector('[data-menu-button]')).display === 'none'
    })`));
    assert.equal(desktopHomeCheck.innerWidth, 1440);
    assert.ok(desktopHomeCheck.scrollWidth <= 1440, "The desktop home page overflows horizontally.");
    assert.equal(desktopHomeCheck.scrolled, true);
    assert.equal(desktopHomeCheck.headerScrolled, true);
    assert.equal(desktopHomeCheck.generatorVisible, true);
    assert.equal(desktopHomeCheck.boardCells, 81);
    assert.equal(desktopHomeCheck.menuHidden, true);

    const homeScreenshot = await send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true
    });
    const homeScreenshotPath = path.resolve("target", "sudoku-home-desktop.png");
    fs.writeFileSync(homeScreenshotPath, Buffer.from(homeScreenshot.data, "base64"));
    assert.deepEqual(javascriptErrors, [], `Browser JavaScript errors: ${javascriptErrors.join(" | ")}`);

    console.log(`Mobile browser interaction smoke passed: viewport ${metrics.innerWidth}px, scroll width ${metrics.scrollWidth}px, key height ${metrics.minimumKeyHeight}px.`);
    console.log("Home navigation, desktop scrolling, difficulty motion, refresh, reduced-motion mode, and JavaScript console passed.");
    console.log(`Desktop result screenshot: ${desktopResultScreenshotPath}`);
    console.log(`Desktop home hero screenshot: ${homeHeroScreenshotPath}`);
    console.log(`Desktop home screenshot: ${homeScreenshotPath}`);
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
