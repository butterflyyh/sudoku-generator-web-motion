import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

public class Main {
    private static final boolean TRACE_ENABLED = true;
    private static final int MAX_TRACE_EVENTS = 40;

    private static int traceEvents = 0;
    private static boolean traceLimitMessagePrinted = false;

    public static int recursiveCalls = 0;
    public static int backtrackCount = 0;

    public static void main(String[] args) {
        System.setOut(new PrintStream(System.out, true, StandardCharsets.UTF_8));

        int[][] board = {
            {5, 3, 0, 0, 7, 0, 0, 0, 0},
            {6, 0, 0, 1, 9, 5, 0, 0, 0},
            {0, 9, 8, 0, 0, 0, 0, 6, 0},
            {8, 0, 0, 0, 6, 0, 0, 0, 3},
            {4, 0, 0, 8, 0, 3, 0, 0, 1},
            {7, 0, 0, 0, 2, 0, 0, 0, 6},
            {0, 6, 0, 0, 0, 0, 2, 8, 0},
            {0, 0, 0, 4, 1, 9, 0, 0, 5},
            {0, 0, 0, 0, 8, 0, 0, 7, 9}
        };

        System.out.println("========================================");
        System.out.println("Sudoku Solver Using Recursive Backtracking");
        System.out.println("========================================");
        System.out.println();

        System.out.println("Initial Sudoku:");
        printBoard(board);
        System.out.println();

        System.out.println("Solving...");
        System.out.println();

        long startTime = System.nanoTime();
        boolean solved = solveSudoku(board, 0);
        long endTime = System.nanoTime();

        double executionTimeMs = (endTime - startTime) / 1_000_000.0;

        System.out.println();
        System.out.println("Solved: " + solved);
        System.out.println();

        System.out.println("Final Sudoku:");
        printBoard(board);
        System.out.println();

        System.out.println("Statistics:");
        System.out.println("Recursive calls: " + recursiveCalls);
        System.out.println("Backtracks: " + backtrackCount);
        System.out.printf("Execution time: %.3f ms%n", executionTimeMs);
    }

    public static void printBoard(int[][] grid) {
        for (int row = 0; row < 9; row++) {
            if (row > 0 && row % 3 == 0) {
                System.out.println("------+-------+------");
            }

            for (int col = 0; col < 9; col++) {
                if (col > 0 && col % 3 == 0) {
                    System.out.print("| ");
                }

                System.out.print(grid[row][col]);

                if (col < 8) {
                    System.out.print(" ");
                }
            }

            System.out.println();
        }
    }

    // Corresponds to pseudocode function ISVALIDMOVE(grid, row, col, num).
    public static boolean isValidMove(int[][] grid, int row, int col, int num) {
        // Check whether num already appears in the same row.
        for (int currentCol = 0; currentCol < 9; currentCol++) {
            if (grid[row][currentCol] == num) {
                return false;
            }
        }

        // Check whether num already appears in the same column.
        for (int currentRow = 0; currentRow < 9; currentRow++) {
            if (grid[currentRow][col] == num) {
                return false;
            }
        }

        int startRow = 3 * (row / 3);
        int startCol = 3 * (col / 3);

        // Check whether num already appears in the same 3x3 box.
        for (int r = startRow; r < startRow + 3; r++) {
            for (int c = startCol; c < startCol + 3; c++) {
                if (grid[r][c] == num) {
                    return false;
                }
            }
        }

        return true;
    }

    // Corresponds to pseudocode function FINDEMPTY(grid).
    public static int[] findEmpty(int[][] grid) {
        for (int row = 0; row < 9; row++) {
            for (int col = 0; col < 9; col++) {
                if (grid[row][col] == 0) {
                    return new int[]{row, col};
                }
            }
        }

        return null;
    }

    // Corresponds to pseudocode functions SOLVESUDOKU(grid) and SOLVE(G).
    public static boolean solveSudoku(int[][] grid, int depth) {
        recursiveCalls++;

        int[] emptyCell = findEmpty(grid);

        // Base case: no empty cell means the Sudoku is complete.
        if (emptyCell == null) {
            return true;
        }

        int row = emptyCell[0];
        int col = emptyCell[1];

        trace(depth, "找到空格：第 " + (row + 1) + " 行，第 " + (col + 1) + " 列");

        // Candidate trial: try numbers 1 through 9 in the current empty cell.
        for (int num = 1; num <= 9; num++) {
            trace(depth, "尝试填入数字 " + num);

            if (isValidMove(grid, row, col, num)) {
                grid[row][col] = num;
                trace(depth, "数字 " + num + " 合法，填入成功");

                // Recursion: solve the remaining board after this choice.
                if (solveSudoku(grid, depth + 1)) {
                    return true;
                }

                // Backtracking: undo this choice when it cannot lead to a solution.
                grid[row][col] = 0;
                backtrackCount++;
                trace(depth, "当前路径无法完成，回溯");
                trace(depth, "清除第 " + (row + 1) + " 行，第 " + (col + 1)
                    + " 列中的数字 " + num);
            }
        }

        return false;
    }

    private static void trace(int depth, String message) {
        if (!TRACE_ENABLED) {
            return;
        }

        if (traceEvents < MAX_TRACE_EVENTS) {
            System.out.println("[Depth " + depth + "] " + message);
            traceEvents++;
        } else if (!traceLimitMessagePrinted) {
            System.out.println("[Trace] 输出已达到上限，后续过程省略。");
            traceLimitMessagePrinted = true;
        }
    }
}
