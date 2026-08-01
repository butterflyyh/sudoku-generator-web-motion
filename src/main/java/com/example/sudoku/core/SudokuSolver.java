package com.example.sudoku.core;

/**
 * Backtracking Sudoku solver using the minimum-remaining-values (MRV) heuristic.
 * The algorithm is adapted from the original heuristic.java and SudokuGenerator.java.
 */
public final class SudokuSolver {
    public static final int SIZE = 9;
    private static final int BOX_SIZE = 3;

    private SudokuSolver() {
    }

    public static boolean solve(int[][] board) {
        validateShape(board);
        return solveInternal(board);
    }

    private static boolean solveInternal(int[][] board) {
        int[] cell = findBestEmptyCell(board);
        if (cell == null) {
            return true;
        }

        for (int number = 1; number <= SIZE; number++) {
            if (isValid(board, cell[0], cell[1], number)) {
                board[cell[0]][cell[1]] = number;
                if (solveInternal(board)) {
                    return true;
                }
                board[cell[0]][cell[1]] = 0;
            }
        }
        return false;
    }

    /** Counts solutions only up to {@code limit}, which makes uniqueness checks fast. */
    public static int countSolutions(int[][] board, int limit) {
        validateShape(board);
        if (limit < 1) {
            throw new IllegalArgumentException("Solution limit must be positive.");
        }

        int[] count = {0};
        countSolutions(board, count, limit);
        return count[0];
    }

    public static boolean isValid(int[][] board, int row, int col, int number) {
        for (int index = 0; index < SIZE; index++) {
            if (board[row][index] == number || board[index][col] == number) {
                return false;
            }
        }

        int startRow = row - row % BOX_SIZE;
        int startCol = col - col % BOX_SIZE;
        for (int currentRow = startRow; currentRow < startRow + BOX_SIZE; currentRow++) {
            for (int currentCol = startCol; currentCol < startCol + BOX_SIZE; currentCol++) {
                if (board[currentRow][currentCol] == number) {
                    return false;
                }
            }
        }
        return true;
    }

    public static int[][] copyBoard(int[][] board) {
        validateShape(board);
        int[][] copy = new int[SIZE][SIZE];
        for (int row = 0; row < SIZE; row++) {
            System.arraycopy(board[row], 0, copy[row], 0, SIZE);
        }
        return copy;
    }

    private static void countSolutions(int[][] board, int[] count, int limit) {
        if (count[0] >= limit) {
            return;
        }

        int[] cell = findBestEmptyCell(board);
        if (cell == null) {
            count[0]++;
            return;
        }

        for (int number = 1; number <= SIZE; number++) {
            if (isValid(board, cell[0], cell[1], number)) {
                board[cell[0]][cell[1]] = number;
                countSolutions(board, count, limit);
                board[cell[0]][cell[1]] = 0;
                if (count[0] >= limit) {
                    return;
                }
            }
        }
    }

    /** Selects the empty cell with the fewest valid candidates. */
    private static int[] findBestEmptyCell(int[][] board) {
        int[] best = null;
        int fewestCandidates = SIZE + 1;

        for (int row = 0; row < SIZE; row++) {
            for (int col = 0; col < SIZE; col++) {
                if (board[row][col] != 0) {
                    continue;
                }

                int candidates = 0;
                for (int number = 1; number <= SIZE; number++) {
                    if (isValid(board, row, col, number)) {
                        candidates++;
                    }
                }

                if (candidates < fewestCandidates) {
                    fewestCandidates = candidates;
                    best = new int[]{row, col};
                    if (candidates == 0) {
                        return best;
                    }
                }
            }
        }
        return best;
    }

    private static void validateShape(int[][] board) {
        if (board == null || board.length != SIZE) {
            throw new IllegalArgumentException("A Sudoku board must contain 9 rows.");
        }
        for (int[] row : board) {
            if (row == null || row.length != SIZE) {
                throw new IllegalArgumentException("Every Sudoku row must contain 9 cells.");
            }
        }
    }
}
