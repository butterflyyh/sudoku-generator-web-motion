package com.example.sudoku.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.stereotype.Service;

/**
 * Generates a random complete board and removes clues while preserving one solution.
 * This keeps the structure and clue targets of the original SudokuGenerator.java.
 */
@Service
public class SudokuGenerator {
    private static final int SIZE = SudokuSolver.SIZE;
    private static final int MAX_GENERATION_ATTEMPTS = 250;

    public GeneratedSudoku generate(Difficulty difficulty) {
        long start = System.nanoTime();

        for (int attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
            int[][] solution = new int[SIZE][SIZE];
            if (!fillBoardRandomly(solution)) {
                continue;
            }

            int[][] puzzle = SudokuSolver.copyBoard(solution);
            removeNumbers(puzzle, difficulty.clueCount());

            if (countClues(puzzle) == difficulty.clueCount()
                && SudokuSolver.countSolutions(SudokuSolver.copyBoard(puzzle), 2) == 1) {
                double responseTimeMs = (System.nanoTime() - start) / 1_000_000.0;
                return new GeneratedSudoku(puzzle, solution, responseTimeMs);
            }
        }

        throw new IllegalStateException("Unable to generate a unique Sudoku puzzle. Please try again.");
    }

    /** Uses randomized recursive backtracking to create a complete board. */
    private boolean fillBoardRandomly(int[][] board) {
        int[] empty = findEmptyCell(board);
        if (empty == null) {
            return true;
        }

        List<Integer> numbers = new ArrayList<>(SIZE);
        for (int number = 1; number <= SIZE; number++) {
            numbers.add(number);
        }
        Collections.shuffle(numbers, ThreadLocalRandom.current());

        for (int number : numbers) {
            if (SudokuSolver.isValid(board, empty[0], empty[1], number)) {
                board[empty[0]][empty[1]] = number;
                if (fillBoardRandomly(board)) {
                    return true;
                }
                board[empty[0]][empty[1]] = 0;
            }
        }
        return false;
    }

    /** Removes a clue only when the puzzle still has exactly one solution. */
    private void removeNumbers(int[][] puzzle, int targetClues) {
        List<Integer> cells = new ArrayList<>(SIZE * SIZE);
        for (int index = 0; index < SIZE * SIZE; index++) {
            cells.add(index);
        }
        Collections.shuffle(cells, ThreadLocalRandom.current());

        for (int index : cells) {
            if (countClues(puzzle) <= targetClues) {
                break;
            }

            int row = index / SIZE;
            int col = index % SIZE;
            int original = puzzle[row][col];
            puzzle[row][col] = 0;

            if (SudokuSolver.countSolutions(puzzle, 2) != 1) {
                puzzle[row][col] = original;
            }
        }
    }

    private int[] findEmptyCell(int[][] board) {
        for (int row = 0; row < SIZE; row++) {
            for (int col = 0; col < SIZE; col++) {
                if (board[row][col] == 0) {
                    return new int[]{row, col};
                }
            }
        }
        return null;
    }

    public static int countClues(int[][] board) {
        int clues = 0;
        for (int[] row : board) {
            for (int value : row) {
                if (value != 0) {
                    clues++;
                }
            }
        }
        return clues;
    }
}
