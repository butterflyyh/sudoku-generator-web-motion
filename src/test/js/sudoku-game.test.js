const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SudokuGame,
  formatElapsed,
  moveSelection,
  goBackOrFallback
} = require("../../main/resources/static/script.js");

const solution = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9
];

function gameWithEmptyBoard() {
  return new SudokuGame(Array(81).fill(0), solution);
}

test("fixed clues cannot be modified", () => {
  const puzzle = Array(81).fill(0);
  puzzle[0] = solution[0];
  const game = new SudokuGame(puzzle, solution);

  assert.equal(game.setValue(0, 1).changed, false);
  assert.equal(game.erase(0).changed, false);
  assert.equal(game.valueAt(0), solution[0]);
});

test("editable cells accept numbers and can be erased", () => {
  const game = gameWithEmptyBoard();

  assert.equal(game.setValue(4, 7).changed, true);
  assert.equal(game.valueAt(4), 7);
  assert.equal(game.erase(4).changed, true);
  assert.equal(game.valueAt(4), 0);
});

test("row, column, and box duplicates are marked as conflicts", () => {
  const game = gameWithEmptyBoard();
  game.setValue(0, 1);
  game.setValue(8, 1);
  game.setValue(72, 1);
  game.setValue(1, 2);
  game.setValue(9, 2);

  const conflicts = game.getConflictIndices();
  assert.equal(conflicts.has(0), true);
  assert.equal(conflicts.has(1), true);
  assert.equal(conflicts.has(8), true);
  assert.equal(conflicts.has(9), true);
  assert.equal(conflicts.has(72), true);
});

test("check progress distinguishes correct and incorrect entries", () => {
  const game = gameWithEmptyBoard();
  game.setValue(0, solution[0]);
  game.setValue(1, 8);

  const progress = game.checkProgress();
  assert.deepEqual(progress, {
    correct: 1,
    incorrect: 1,
    remaining: 79,
    completed: false
  });
  assert.equal(game.correctIndices.has(0), true);
  assert.equal(game.incorrectIndices.has(1), true);
});

test("hints fill the selected cell and are limited to three per puzzle", () => {
  const game = gameWithEmptyBoard();
  game.select(10);

  const first = game.useHint();
  const second = game.useHint();
  const third = game.useHint();
  const fourth = game.useHint();

  assert.equal(first.index, 10);
  assert.equal(game.valueAt(10), solution[10]);
  assert.equal(first.used, true);
  assert.equal(second.used, true);
  assert.equal(third.used, true);
  assert.equal(fourth.used, false);
  assert.equal(game.hintsUsed, 3);
});

test("reset clears entries and timer but keeps clues and spent hints", () => {
  const puzzle = Array(81).fill(0);
  puzzle[0] = solution[0];
  const game = new SudokuGame(puzzle, solution);
  game.setValue(1, 8);
  game.select(2);
  game.useHint();
  game.startTimer();
  game.tickTimer();

  game.resetEntries();

  assert.equal(game.valueAt(0), solution[0]);
  assert.equal(game.valueAt(1), 0);
  assert.equal(game.valueAt(2), 0);
  assert.equal(game.hintsUsed, 1);
  assert.equal(game.elapsedSeconds, 0);
  assert.equal(game.timerRunning, false);
});

test("entering the final correct value completes the puzzle and stops time", () => {
  const puzzle = [...solution];
  puzzle[80] = 0;
  const game = new SudokuGame(puzzle, solution);
  game.startTimer();
  game.tickTimer();
  game.tickTimer();

  const result = game.setValue(80, solution[80]);

  assert.equal(result.completed, true);
  assert.equal(game.completed, true);
  assert.equal(game.timerRunning, false);
  assert.equal(game.elapsedSeconds, 2);
  game.tickTimer();
  assert.equal(game.elapsedSeconds, 2);
});

test("a newly generated game starts with clean state", () => {
  const oldGame = gameWithEmptyBoard();
  oldGame.useHint();
  oldGame.startTimer();
  oldGame.tickTimer();

  const newGame = gameWithEmptyBoard();
  assert.equal(newGame.userValues.every((value) => value === 0), true);
  assert.equal(newGame.hintsUsed, 0);
  assert.equal(newGame.elapsedSeconds, 0);
  assert.equal(newGame.completed, false);
  assert.equal(newGame.correctIndices.size, 0);
  assert.equal(newGame.incorrectIndices.size, 0);
});

test("back navigation uses history and falls back when history is empty", () => {
  let wentBack = false;
  const withHistory = {
    history: { length: 2, back: () => { wentBack = true; } },
    location: { assign: () => assert.fail("fallback should not run") }
  };
  assert.equal(goBackOrFallback(withHistory, "index.html"), "history");
  assert.equal(wentBack, true);

  let destination = null;
  const withoutHistory = {
    history: { length: 1, back: () => assert.fail("history should not run") },
    location: { assign: (value) => { destination = value; } }
  };
  assert.equal(goBackOrFallback(withoutHistory, "difficulty.html"), "fallback");
  assert.equal(destination, "difficulty.html");
});

test("arrow movement stays inside the board", () => {
  assert.equal(moveSelection(40, "ArrowUp"), 31);
  assert.equal(moveSelection(40, "ArrowDown"), 49);
  assert.equal(moveSelection(40, "ArrowLeft"), 39);
  assert.equal(moveSelection(40, "ArrowRight"), 41);
  assert.equal(moveSelection(0, "ArrowUp"), 0);
  assert.equal(moveSelection(80, "ArrowRight"), 80);
});

test("elapsed time uses MM:SS format", () => {
  assert.equal(formatElapsed(0), "00:00");
  assert.equal(formatElapsed(65), "01:05");
});
