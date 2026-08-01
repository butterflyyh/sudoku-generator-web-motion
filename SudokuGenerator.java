import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.Scanner;

/**
 * 可选难度的 9x9 数独生成器。
 *
 * 程序会生成只有一个解的数独，然后显示题目、解答和耗时。
 */
public class SudokuGenerator {
    private static final int SIZE = 9;
    private static final int BOX_SIZE = 3;
    private static final Random RANDOM = new Random();

    private enum Difficulty {
        EASY(1, "简单", 40),
        MEDIUM(2, "中等", 32),
        HARD(3, "困难", 26);

        final int choice;
        final String name;
        final int clues;

        Difficulty(int choice, String name, int clues) {
            this.choice = choice;
            this.name = name;
            this.clues = clues;
        }

        static Difficulty fromChoice(int choice) {
            for (Difficulty difficulty : values()) {
                if (difficulty.choice == choice) {
                    return difficulty;
                }
            }
            return null;
        }
    }

    public static void main(String[] args) {
        System.setOut(new PrintStream(System.out, true, StandardCharsets.UTF_8));

        try (Scanner scanner = new Scanner(System.in, StandardCharsets.UTF_8)) {
            Difficulty difficulty = chooseDifficulty(scanner);
            if (difficulty == null) {
                System.out.println("程序已退出。");
                return;
            }

            long totalStart = System.nanoTime();

            long generationStart = System.nanoTime();
            int[][] puzzle = generatePuzzle(difficulty.clues);
            long generationEnd = System.nanoTime();

            int[][] answer = copyBoard(puzzle);
            long solvingStart = System.nanoTime();
            boolean solved = solve(answer);
            long solvingEnd = System.nanoTime();

            if (!solved) {
                System.out.println("生成失败，请重新运行程序。");
                return;
            }

            System.out.println();
            System.out.println("难度：" + difficulty.name);
            System.out.println("已知数字：" + countClues(puzzle));
            System.out.println();
            System.out.println("========== 数独题目 ==========");
            printBoard(puzzle);
            System.out.println();
            System.out.println("========== 数独解答 ==========");
            printBoard(answer);

            double generationMs = nanosToMillis(generationEnd - generationStart);
            double solvingMs = nanosToMillis(solvingEnd - solvingStart);
            double totalMs = nanosToMillis(System.nanoTime() - totalStart);

            System.out.println();
            System.out.println("========== 响应时间 ==========");
            System.out.printf("生成耗时：%.3f ms%n", generationMs);
            System.out.printf("求解耗时：%.3f ms%n", solvingMs);
            System.out.printf("总响应时间：%.3f ms%n", totalMs);
        }
    }

    private static Difficulty chooseDifficulty(Scanner scanner) {
        while (true) {
            System.out.println("========== 数独生成器 ==========");
            System.out.println("1. 简单（40 个已知数字）");
            System.out.println("2. 中等（32 个已知数字）");
            System.out.println("3. 困难（26 个已知数字）");
            System.out.println("0. 退出");
            System.out.print("请选择难度：");

            if (!scanner.hasNextLine()) {
                return null;
            }

            String input = scanner.nextLine().trim();
            if (input.equals("0")) {
                return null;
            }

            try {
                Difficulty difficulty = Difficulty.fromChoice(Integer.parseInt(input));
                if (difficulty != null) {
                    return difficulty;
                }
            } catch (NumberFormatException ignored) {
                // 在下面统一显示错误提示。
            }

            System.out.println("输入无效，请输入 1、2 或 3。");
            System.out.println();
        }
    }

    private static int[][] generatePuzzle(int targetClues) {
        while (true) {
            int[][] solution = new int[SIZE][SIZE];
            fillBoardRandomly(solution);

            int[][] puzzle = copyBoard(solution);
            removeNumbers(puzzle, targetClues);

            // 某些随机棋盘无法刚好挖到目标数量，此时换一个棋盘重试。
            if (countClues(puzzle) == targetClues) {
                return puzzle;
            }
        }
    }

    /** 用随机化回溯法生成一个完整棋盘。 */
    private static boolean fillBoardRandomly(int[][] board) {
        int[] empty = findEmptyCell(board);
        if (empty == null) {
            return true;
        }

        List<Integer> numbers = new ArrayList<>();
        for (int number = 1; number <= SIZE; number++) {
            numbers.add(number);
        }
        Collections.shuffle(numbers, RANDOM);

        for (int number : numbers) {
            if (isValid(board, empty[0], empty[1], number)) {
                board[empty[0]][empty[1]] = number;
                if (fillBoardRandomly(board)) {
                    return true;
                }
                board[empty[0]][empty[1]] = 0;
            }
        }
        return false;
    }

    /** 随机挖空格子，只保留不会破坏唯一解的操作。 */
    private static void removeNumbers(int[][] puzzle, int targetClues) {
        List<Integer> cells = new ArrayList<>();
        for (int index = 0; index < SIZE * SIZE; index++) {
            cells.add(index);
        }
        Collections.shuffle(cells, RANDOM);

        for (int index : cells) {
            if (countClues(puzzle) <= targetClues) {
                break;
            }

            int row = index / SIZE;
            int col = index % SIZE;
            int original = puzzle[row][col];
            puzzle[row][col] = 0;

            int[] solutionCount = {0};
            countSolutions(puzzle, solutionCount, 2);
            if (solutionCount[0] != 1) {
                puzzle[row][col] = original;
            }
        }
    }

    /** 普通回溯求解，第一个解找到后即返回。 */
    private static boolean solve(int[][] board) {
        int[] cell = findBestEmptyCell(board);
        if (cell == null) {
            return true;
        }

        for (int number = 1; number <= SIZE; number++) {
            if (isValid(board, cell[0], cell[1], number)) {
                board[cell[0]][cell[1]] = number;
                if (solve(board)) {
                    return true;
                }
                board[cell[0]][cell[1]] = 0;
            }
        }
        return false;
    }

    /** 最多统计 limit 个解，用于快速检查题目是否有唯一解。 */
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

    /** 选择候选数最少的空格，可以明显减少回溯次数。 */
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

    private static int[] findEmptyCell(int[][] board) {
        for (int row = 0; row < SIZE; row++) {
            for (int col = 0; col < SIZE; col++) {
                if (board[row][col] == 0) {
                    return new int[]{row, col};
                }
            }
        }
        return null;
    }

    private static boolean isValid(int[][] board, int row, int col, int number) {
        for (int index = 0; index < SIZE; index++) {
            if (board[row][index] == number || board[index][col] == number) {
                return false;
            }
        }

        int startRow = row - row % BOX_SIZE;
        int startCol = col - col % BOX_SIZE;
        for (int r = startRow; r < startRow + BOX_SIZE; r++) {
            for (int c = startCol; c < startCol + BOX_SIZE; c++) {
                if (board[r][c] == number) {
                    return false;
                }
            }
        }
        return true;
    }

    private static int countClues(int[][] board) {
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

    private static int[][] copyBoard(int[][] board) {
        int[][] copy = new int[SIZE][SIZE];
        for (int row = 0; row < SIZE; row++) {
            System.arraycopy(board[row], 0, copy[row], 0, SIZE);
        }
        return copy;
    }

    private static void printBoard(int[][] board) {
        for (int row = 0; row < SIZE; row++) {
            if (row > 0 && row % BOX_SIZE == 0) {
                System.out.println("------+-------+------");
            }

            for (int col = 0; col < SIZE; col++) {
                if (col > 0 && col % BOX_SIZE == 0) {
                    System.out.print("| ");
                }
                System.out.print(board[row][col] == 0 ? ". " : board[row][col] + " ");
            }
            System.out.println();
        }
    }

    private static double nanosToMillis(long nanoseconds) {
        return nanoseconds / 1_000_000.0;
    }
}
