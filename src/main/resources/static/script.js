class SudokuGame {
  constructor(puzzle, solution) {
    SudokuGame.validateBoard(puzzle, "puzzle");
    SudokuGame.validateBoard(solution, "solution");

    this.puzzle = [...puzzle];
    this.solution = [...solution];
    this.userValues = Array(81).fill(0);
    this.selectedIndex = null;
    this.correctIndices = new Set();
    this.incorrectIndices = new Set();
    this.hintedIndices = new Set();
    this.hintsUsed = 0;
    this.completed = false;
    this.elapsedSeconds = 0;
    this.timerRunning = false;
  }

  static validateBoard(board, name) {
    const valid = Array.isArray(board)
      && board.length === 81
      && board.every((value) => Number.isInteger(value) && value >= 0 && value <= 9);
    if (!valid) {
      throw new Error(`The server returned an invalid ${name}.`);
    }
  }

  isGiven(index) {
    return this.puzzle[index] !== 0;
  }

  valueAt(index) {
    return this.isGiven(index) ? this.puzzle[index] : this.userValues[index];
  }

  select(index) {
    if (!Number.isInteger(index) || index < 0 || index >= 81) {
      return false;
    }
    this.selectedIndex = index;
    return true;
  }

  setValue(index, value, { fromHint = false } = {}) {
    if (!Number.isInteger(value) || value < 0 || value > 9) {
      return { changed: false, completed: this.completed };
    }
    if (this.completed || this.isGiven(index)) {
      return { changed: false, completed: this.completed };
    }

    this.userValues[index] = value;
    this.correctIndices.delete(index);
    this.incorrectIndices.delete(index);
    if (fromHint) {
      this.hintedIndices.add(index);
    } else {
      this.hintedIndices.delete(index);
    }

    this.completed = this.isBoardCorrect();
    if (this.completed) {
      this.stopTimer();
    }
    return { changed: true, completed: this.completed };
  }

  erase(index) {
    return this.setValue(index, 0);
  }

  getRemainingCount() {
    let remaining = 0;
    for (let index = 0; index < 81; index += 1) {
      if (!this.isGiven(index) && this.userValues[index] === 0) {
        remaining += 1;
      }
    }
    return remaining;
  }

  getConflictIndices() {
    const conflicts = new Set();
    const units = [];

    for (let row = 0; row < 9; row += 1) {
      units.push(Array.from({ length: 9 }, (_, col) => row * 9 + col));
    }
    for (let col = 0; col < 9; col += 1) {
      units.push(Array.from({ length: 9 }, (_, row) => row * 9 + col));
    }
    for (let boxRow = 0; boxRow < 3; boxRow += 1) {
      for (let boxCol = 0; boxCol < 3; boxCol += 1) {
        const box = [];
        for (let row = boxRow * 3; row < boxRow * 3 + 3; row += 1) {
          for (let col = boxCol * 3; col < boxCol * 3 + 3; col += 1) {
            box.push(row * 9 + col);
          }
        }
        units.push(box);
      }
    }

    units.forEach((unit) => {
      const positionsByValue = new Map();
      unit.forEach((index) => {
        const value = this.valueAt(index);
        if (value === 0) {
          return;
        }
        const positions = positionsByValue.get(value) || [];
        positions.push(index);
        positionsByValue.set(value, positions);
      });
      positionsByValue.forEach((positions) => {
        if (positions.length > 1) {
          positions.forEach((index) => conflicts.add(index));
        }
      });
    });

    return conflicts;
  }

  checkProgress() {
    this.correctIndices.clear();
    this.incorrectIndices.clear();

    for (let index = 0; index < 81; index += 1) {
      if (this.isGiven(index) || this.userValues[index] === 0) {
        continue;
      }
      if (this.userValues[index] === this.solution[index]) {
        this.correctIndices.add(index);
      } else {
        this.incorrectIndices.add(index);
      }
    }

    this.completed = this.isBoardCorrect();
    if (this.completed) {
      this.stopTimer();
    }
    return {
      correct: this.correctIndices.size,
      incorrect: this.incorrectIndices.size,
      remaining: this.getRemainingCount(),
      completed: this.completed
    };
  }

  useHint() {
    if (this.completed || this.hintsUsed >= 3) {
      return { used: false, completed: this.completed, index: null };
    }

    let target = this.selectedIndex;
    if (target === null || this.isGiven(target) || this.valueAt(target) === this.solution[target]) {
      target = this.puzzle.findIndex((value, index) => (
        value === 0 && this.userValues[index] !== this.solution[index]
      ));
    }
    if (target < 0) {
      return { used: false, completed: this.completed, index: null };
    }

    this.selectedIndex = target;
    this.hintsUsed += 1;
    const result = this.setValue(target, this.solution[target], { fromHint: true });
    return { used: true, completed: result.completed, index: target };
  }

  resetEntries() {
    this.userValues.fill(0);
    this.selectedIndex = null;
    this.correctIndices.clear();
    this.incorrectIndices.clear();
    this.hintedIndices.clear();
    this.completed = false;
    this.resetTimer();
  }

  isBoardCorrect() {
    return this.solution.every((answer, index) => this.valueAt(index) === answer);
  }

  startTimer() {
    if (!this.completed) {
      this.timerRunning = true;
    }
  }

  stopTimer() {
    this.timerRunning = false;
  }

  resetTimer() {
    this.elapsedSeconds = 0;
    this.timerRunning = false;
  }

  tickTimer() {
    if (this.timerRunning) {
      this.elapsedSeconds += 1;
    }
    return this.elapsedSeconds;
  }
}

function flattenBoard(board, name) {
  const valid = Array.isArray(board)
    && board.length === 9
    && board.every((row) => Array.isArray(row)
      && row.length === 9
      && row.every((value) => Number.isInteger(value) && value >= 0 && value <= 9));
  if (!valid) {
    throw new Error(`The server returned an invalid ${name}.`);
  }
  return board.flat();
}

function formatElapsed(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function moveSelection(index, key) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const moves = {
    ArrowUp: [Math.max(0, row - 1), col],
    ArrowDown: [Math.min(8, row + 1), col],
    ArrowLeft: [row, Math.max(0, col - 1)],
    ArrowRight: [row, Math.min(8, col + 1)]
  };
  const next = moves[key];
  return next ? next[0] * 9 + next[1] : index;
}

function goBackOrFallback(browserWindow, fallback) {
  if (browserWindow.history && browserWindow.history.length > 1) {
    browserWindow.history.back();
    return "history";
  }
  if (typeof browserWindow.location.assign === "function") {
    browserWindow.location.assign(fallback);
  } else {
    browserWindow.location.href = fallback;
  }
  return "fallback";
}

const SudokuGameApi = {
  SudokuGame,
  flattenBoard,
  formatElapsed,
  moveSelection,
  goBackOrFallback
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = SudokuGameApi;
}
if (typeof globalThis !== "undefined") {
  globalThis.SudokuGameApi = SudokuGameApi;
}

if (typeof document !== "undefined") {
  document.querySelectorAll("[data-back-button]").forEach((button) => {
    button.addEventListener("click", () => {
      goBackOrFallback(window, button.dataset.fallback);
    });
  });

  const grid = document.querySelector("#sudoku-grid");
  if (grid) {
    const difficultyLabel = document.querySelector("#difficulty-label");
    const responseTime = document.querySelector("#response-time");
    const timerDisplay = document.querySelector("#game-timer");
    const solutionButton = document.querySelector("#solution-button");
    const generateButton = document.querySelector("#generate-button");
    const checkButton = document.querySelector("#check-button");
    const resetButton = document.querySelector("#reset-button");
    const hintButton = document.querySelector("#hint-button");
    const hintsRemaining = document.querySelector("#hints-remaining");
    const gridMessage = document.querySelector("#grid-message");
    const completionPanel = document.querySelector("#completion-panel");
    const completionDetails = document.querySelector("#completion-details");
    const numberButtons = [...document.querySelectorAll("[data-number]")];
    const eraseButton = document.querySelector("#erase-button");
    const validDifficulties = ["Easy", "Medium", "Hard"];
    const requestedDifficulty = new URLSearchParams(window.location.search).get("difficulty");
    const difficulty = validDifficulties.includes(requestedDifficulty)
      ? requestedDifficulty
      : "Medium";

    let game = null;
    let solutionVisible = false;
    let timerId = null;
    let loading = false;

    difficultyLabel.textContent = difficulty;

    function isRelated(first, second) {
      const firstRow = Math.floor(first / 9);
      const firstCol = first % 9;
      const secondRow = Math.floor(second / 9);
      const secondCol = second % 9;
      return firstRow === secondRow
        || firstCol === secondCol
        || (Math.floor(firstRow / 3) === Math.floor(secondRow / 3)
          && Math.floor(firstCol / 3) === Math.floor(secondCol / 3));
    }

    function cellAriaLabel(index, value, conflicts) {
      const row = Math.floor(index / 9) + 1;
      const col = index % 9 + 1;
      const parts = [`Row ${row}, column ${col}`];
      if (game.isGiven(index)) {
        parts.push(`fixed ${value}`);
      } else {
        parts.push(value === 0 ? "editable, empty" : `editable, ${value}`);
      }
      if (!solutionVisible && conflicts.has(index)) {
        parts.push("conflict");
      } else if (!solutionVisible && game.incorrectIndices.has(index)) {
        parts.push("incorrect");
      } else if (!solutionVisible && (game.correctIndices.has(index) || game.completed)) {
        parts.push("correct");
      }
      if (!solutionVisible && game.hintedIndices.has(index)) {
        parts.push("filled by hint");
      }
      return parts.join(", ");
    }

    function renderGrid(focusSelected = false) {
      if (!game) {
        return;
      }

      grid.replaceChildren();
      grid.classList.remove("loading", "error");
      const conflicts = solutionVisible ? new Set() : game.getConflictIndices();
      const firstEditable = game.puzzle.findIndex((value) => value === 0);

      for (let index = 0; index < 81; index += 1) {
        const row = Math.floor(index / 9);
        const column = index % 9;
        const cell = document.createElement("button");
        const given = game.isGiven(index);
        const value = solutionVisible ? game.solution[index] : game.valueAt(index);

        cell.type = "button";
        cell.className = "sudoku-cell";
        cell.dataset.index = String(index);
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-rowindex", String(row + 1));
        cell.setAttribute("aria-colindex", String(column + 1));
        cell.setAttribute("aria-selected", String(game.selectedIndex === index));
        cell.setAttribute("aria-label", cellAriaLabel(index, value, conflicts));
        cell.tabIndex = game.selectedIndex === index
          || (game.selectedIndex === null && index === firstEditable) ? 0 : -1;
        cell.textContent = value === 0 ? "" : String(value);
        cell.classList.add(given ? "fixed" : "editable");

        if (!given && value !== 0 && !solutionVisible) {
          cell.classList.add("user-entry");
        }
        if (value === 0) {
          cell.classList.add("empty");
        }
        if (game.selectedIndex === index && !solutionVisible) {
          cell.classList.add("selected");
        } else if (game.selectedIndex !== null
            && !solutionVisible
            && isRelated(game.selectedIndex, index)) {
          cell.classList.add("related");
        }
        if (!solutionVisible && (game.correctIndices.has(index)
            || (game.completed && !given))) {
          cell.classList.add("correct");
        }
        if (!solutionVisible && game.incorrectIndices.has(index)) {
          cell.classList.add("incorrect");
        }
        if (!solutionVisible && game.hintedIndices.has(index)) {
          cell.classList.add("hinted");
        }
        if (!solutionVisible && conflicts.has(index)) {
          cell.classList.add("conflict");
        }
        if (!given && solutionVisible) {
          cell.classList.add("revealed");
        }
        if (column === 2 || column === 5) {
          cell.classList.add("box-right");
        }
        if (row === 2 || row === 5) {
          cell.classList.add("box-bottom");
        }

        cell.addEventListener("click", () => {
          if (solutionVisible) {
            return;
          }
          game.select(index);
          renderGrid(true);
        });
        grid.appendChild(cell);
      }

      if (focusSelected && game.selectedIndex !== null) {
        grid.querySelector(`[data-index="${game.selectedIndex}"]`)?.focus();
      }
    }

    function updateTimerDisplay() {
      timerDisplay.textContent = formatElapsed(game ? game.elapsedSeconds : 0);
    }

    function clearTimerInterval() {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    }

    function stopTimer() {
      clearTimerInterval();
      if (game) {
        game.stopTimer();
      }
    }

    function startTimer(reset = false) {
      clearTimerInterval();
      if (!game || game.completed || solutionVisible) {
        return;
      }
      if (reset) {
        game.resetTimer();
      }
      game.startTimer();
      updateTimerDisplay();
      timerId = window.setInterval(() => {
        game.tickTimer();
        updateTimerDisplay();
      }, 1000);
    }

    function updateControls() {
      const ready = Boolean(game) && !loading;
      const playable = ready && !solutionVisible && !game.completed;
      solutionButton.disabled = !ready;
      generateButton.disabled = loading;
      checkButton.disabled = !playable;
      resetButton.disabled = !ready || solutionVisible;
      hintButton.disabled = !playable || game.hintsUsed >= 3 || game.getRemainingCount() === 0;
      numberButtons.forEach((button) => {
        button.disabled = !playable;
      });
      eraseButton.disabled = !playable;
      hintsRemaining.textContent = game
        ? `${3 - game.hintsUsed} of 3 hints remaining`
        : "3 of 3 hints remaining";
    }

    function hideCompletion() {
      completionPanel.hidden = true;
      completionDetails.textContent = "";
    }

    function showCompletion() {
      stopTimer();
      completionPanel.hidden = false;
      completionDetails.textContent = `${difficultyLabel.textContent} · ${formatElapsed(game.elapsedSeconds)} · ${game.hintsUsed} hint${game.hintsUsed === 1 ? "" : "s"} used`;
      gridMessage.textContent = "Congratulations! You completed the puzzle correctly.";
      renderGrid();
      updateControls();
    }

    function applyValue(value) {
      if (!game || solutionVisible || game.completed) {
        return;
      }
      if (game.selectedIndex === null) {
        gridMessage.textContent = "Select an editable cell first.";
        return;
      }
      if (game.isGiven(game.selectedIndex)) {
        gridMessage.textContent = "That is a fixed number and cannot be changed.";
        return;
      }

      const result = game.setValue(game.selectedIndex, value);
      renderGrid(true);
      if (result.completed) {
        showCompletion();
      } else {
        gridMessage.textContent = value === 0
          ? "The selected cell was cleared."
          : `Entered ${value} in the selected cell.`;
        updateControls();
      }
    }

    function showLoading() {
      stopTimer();
      game = null;
      loading = true;
      solutionVisible = false;
      responseTime.textContent = "—";
      updateTimerDisplay();
      hideCompletion();
      grid.classList.remove("error");
      grid.classList.add("loading");
      grid.setAttribute("aria-busy", "true");

      const loadingStatus = document.createElement("div");
      loadingStatus.className = "grid-status";
      loadingStatus.setAttribute("role", "status");
      loadingStatus.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span><strong>Generating puzzle…</strong><span>This may take a moment.</span>';
      grid.replaceChildren(loadingStatus);
      gridMessage.textContent = `Creating a unique ${difficulty.toLowerCase()} puzzle…`;
      updateControls();
    }

    function showError(message) {
      stopTimer();
      loading = false;
      grid.classList.remove("loading");
      grid.classList.add("error");
      grid.setAttribute("aria-busy", "false");

      const error = document.createElement("div");
      error.className = "grid-status grid-error";
      error.setAttribute("role", "alert");
      error.innerHTML = '<strong>We couldn\'t generate a puzzle.</strong><span>Please check that the Java server is running, then try again.</span>';
      grid.replaceChildren(error);
      gridMessage.textContent = message;
      updateControls();
    }

    async function generatePuzzle() {
      showLoading();

      try {
        const response = await fetch(
          `/api/sudoku/generate?difficulty=${encodeURIComponent(difficulty)}`,
          { headers: { Accept: "application/json" } }
        );

        let data = null;
        try {
          data = await response.json();
        } catch {
          throw new Error("The server returned an unreadable response.");
        }
        if (!response.ok) {
          throw new Error(data.message || `The server returned status ${response.status}.`);
        }

        const puzzle = flattenBoard(data.puzzle, "puzzle");
        const solution = flattenBoard(data.solution, "solution");
        if (!validDifficulties.includes(data.difficulty)
            || typeof data.responseTimeMs !== "number"
            || !Number.isFinite(data.responseTimeMs)) {
          throw new Error("The server response is missing puzzle information.");
        }

        game = new SudokuGame(puzzle, solution);
        loading = false;
        solutionVisible = false;
        difficultyLabel.textContent = data.difficulty;
        responseTime.textContent = `${data.responseTimeMs.toFixed(3)} ms`;
        solutionButton.textContent = "Show Solution";
        grid.setAttribute("aria-busy", "false");
        hideCompletion();
        renderGrid();
        startTimer(true);
        updateControls();
        gridMessage.textContent = `A new ${data.difficulty.toLowerCase()} puzzle is ready. Select a cell to begin.`;
      } catch (error) {
        const message = error instanceof Error ? error.message : "An unexpected error occurred.";
        showError(message);
      }
    }

    numberButtons.forEach((button) => {
      button.addEventListener("click", () => applyValue(Number(button.dataset.number)));
    });
    eraseButton.addEventListener("click", () => applyValue(0));

    checkButton.addEventListener("click", () => {
      if (!game || solutionVisible) {
        return;
      }
      const progress = game.checkProgress();
      renderGrid();
      if (progress.completed) {
        showCompletion();
      } else if (progress.incorrect > 0) {
        gridMessage.textContent = `${progress.remaining} empty cell${progress.remaining === 1 ? "" : "s"} remaining. ${progress.incorrect} filled cell${progress.incorrect === 1 ? " is" : "s are"} incorrect.`;
      } else {
        gridMessage.textContent = `${progress.remaining} empty cell${progress.remaining === 1 ? "" : "s"} remaining. Everything entered so far is correct.`;
      }
      updateControls();
    });

    hintButton.addEventListener("click", () => {
      if (!game || solutionVisible) {
        return;
      }
      const hint = game.useHint();
      if (!hint.used) {
        gridMessage.textContent = "No hints remain for this puzzle.";
        updateControls();
        return;
      }
      renderGrid(true);
      if (hint.completed) {
        showCompletion();
      } else {
        gridMessage.textContent = `Hint filled row ${Math.floor(hint.index / 9) + 1}, column ${hint.index % 9 + 1}.`;
        updateControls();
      }
    });

    resetButton.addEventListener("click", () => {
      if (!game || !window.confirm("Clear all of your entries and reset the timer? Used hints will not be restored.")) {
        return;
      }
      game.resetEntries();
      solutionVisible = false;
      solutionButton.textContent = "Show Solution";
      hideCompletion();
      renderGrid();
      startTimer();
      updateControls();
      gridMessage.textContent = "Your entries were cleared. The original clues remain.";
    });

    solutionButton.addEventListener("click", () => {
      if (!game) {
        return;
      }
      if (!solutionVisible) {
        if (!window.confirm("Show the full solution? The timer will pause, and this will not count as completing the puzzle.")) {
          return;
        }
        solutionVisible = true;
        stopTimer();
        solutionButton.textContent = "Hide Solution";
        renderGrid();
        gridMessage.textContent = "Solution revealed. Hide it to return to your own entries.";
      } else {
        solutionVisible = false;
        solutionButton.textContent = "Show Solution";
        renderGrid();
        if (!game.completed) {
          startTimer();
        }
        gridMessage.textContent = "Your entries have been restored.";
      }
      updateControls();
    });

    generateButton.addEventListener("click", generatePuzzle);

    document.addEventListener("keydown", (event) => {
      if (!game || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        applyValue(Number(event.key));
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        applyValue(0);
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        if (game.selectedIndex === null) {
          game.select(game.puzzle.findIndex((value) => value === 0));
        } else {
          game.select(moveSelection(game.selectedIndex, event.key));
        }
        renderGrid(true);
      }
    });

    generatePuzzle();
  }
}
