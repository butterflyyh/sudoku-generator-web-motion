import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Scanner;

public class heuristic {
    private static long recursiveCalls = 0;
    private static long backtrackCount = 0;
    private static int solutionCount = 0;
    private static int[][] firstSolution = null;

    private static class Cell {
        final int row;
        final int col;

        Cell(int row, int col) {
            this.row = row;
            this.col = col;
        }
    }

    public static void main(String[] args) {
        System.setOut(new PrintStream(System.out, true, StandardCharsets.UTF_8));
        Scanner scanner = new Scanner(System.in, StandardCharsets.UTF_8);

        Integer size = chooseSudokuSize(scanner);
        if (size == null) {
            System.out.println("Input cancelled.");
            return;
        }

        while (true) {
            int[][] originalBoard = readConsistentBoard(scanner, size);
            if (originalBoard == null) {
                System.out.println("Input cancelled.");
                return;
            }

            int[][] searchBoard = copyBoard(originalBoard);
            resetStats();

            long startTime = System.nanoTime();
            solveSudokuWithMRV(searchBoard);
            long endTime = System.nanoTime();

            if (solutionCount == 0) {
                System.out.println();
                System.out.println("Invalid Sudoku: the puzzle has no solution.");
                System.out.println("Please correct it and enter the puzzle again.");
                System.out.println();
                continue;
            }

            double timeMillis = (endTime - startTime) / 1_000_000.0;
            System.out.println();
            System.out.println("========================================");
            System.out.println("Initial Sudoku");
            System.out.println("========================================");
            printBoard(originalBoard);
            System.out.println();
            System.out.println("========================================");
            System.out.println("MRV Heuristic Result");
            System.out.println("========================================");
            if (solutionCount == 1) {
                System.out.println("This Sudoku has a unique solution.");
            } else {
                System.out.println("This Sudoku has two or more solutions.");
            }
            printBoard(firstSolution);
            System.out.println();
            System.out.println("Recursive calls: " + recursiveCalls);
            System.out.println("Backtracks: " + backtrackCount);
            System.out.printf("Execution time: %.3f ms%n", timeMillis);
            return;
        }
    }

    // Lets the user select a 4x4, 9x9, or 16x16 Sudoku.
    public static Integer chooseSudokuSize(Scanner scanner) {
        while (true) {
            System.out.println("========================================");
            System.out.println("Choose Sudoku Type");
            System.out.println("========================================");
            System.out.println("1. 4x4 Sudoku   (four 2x2 boxes)");
            System.out.println("2. 9x9 Sudoku   (nine 3x3 boxes)");
            System.out.println("3. 16x16 Sudoku (sixteen 4x4 boxes)");
            System.out.println("q. Quit");
            System.out.print("Choice: ");

            if (!scanner.hasNextLine()) {
                return null;
            }

            String choice = scanner.nextLine().trim();
            if (choice.equalsIgnoreCase("q")) {
                return null;
            }
            if (choice.equals("1") || choice.equals("4")) {
                return 4;
            }
            if (choice.equals("2") || choice.equals("9")) {
                return 9;
            }
            if (choice.equals("3") || choice.equals("16")) {
                return 16;
            }

            System.out.println("Invalid choice. Please select 1, 2, or 3.");
            System.out.println();
        }
    }

    // Re-displays the input page until the format and given clues are consistent.
    // A puzzle that is consistent but unsolvable is returned to main, where the
    // MRV solver detects it and sends the user back here.
    public static int[][] readConsistentBoard(Scanner scanner, int size) {
        while (true) {
            System.out.println();
            System.out.println("========================================");
            System.out.println(size + "x" + size + " Sudoku Input");
            System.out.println("========================================");
            System.out.println("Use 0 or . for an empty cell.");
            if (size == 16) {
                System.out.println("Separate all 16 values with spaces, for example:");
                System.out.println("1 0 0 4 0 6 0 8 9 0 11 0 13 0 15 16");
            } else {
                System.out.println("Use either compact digits or space-separated values.");
            }
            System.out.println("Enter q on the first row to quit.");

            int[][] board = new int[size][size];
            String inputError = null;

            for (int row = 0; row < size; row++) {
                System.out.print("Row " + (row + 1) + ": ");
                if (!scanner.hasNextLine()) {
                    return null;
                }

                String line = scanner.nextLine().trim();
                if (row == 0 && line.equalsIgnoreCase("q")) {
                    return null;
                }

                try {
                    board[row] = parseRow(line, size);
                } catch (IllegalArgumentException exception) {
                    if (inputError == null) {
                        inputError = "row " + (row + 1) + " " + exception.getMessage();
                    }
                }
            }

            String validationError = inputError;
            if (validationError == null) {
                validationError = validateInitialBoard(board);
            }

            if (validationError == null) {
                return board;
            }

            System.out.println();
            System.out.println("Invalid Sudoku: the puzzle " + validationError + ".");
            System.out.println("Please correct it and enter the puzzle again.");
        }
    }

    private static int[] parseRow(String line, int size) {
        if (line.isEmpty()) {
            throw new IllegalArgumentException("must contain exactly " + size + " cells");
        }

        String[] tokens;
        if (line.matches(".*[\\s,].*")) {
            tokens = line.split("[\\s,]+");
        } else if (size <= 9 && line.length() == size) {
            tokens = new String[size];
            for (int index = 0; index < size; index++) {
                tokens[index] = String.valueOf(line.charAt(index));
            }
        } else {
            throw new IllegalArgumentException("must contain exactly " + size
                + " space-separated cells");
        }

        if (tokens.length != size) {
            throw new IllegalArgumentException("must contain exactly " + size + " cells");
        }

        int[] row = new int[size];
        for (int col = 0; col < size; col++) {
            String token = tokens[col];
            if (token.equals(".")) {
                row[col] = 0;
                continue;
            }

            try {
                row[col] = Integer.parseInt(token);
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException("contains an invalid value: " + token);
            }

            if (row[col] < 0 || row[col] > size) {
                throw new IllegalArgumentException("contains a value outside 0-" + size);
            }
        }
        return row;
    }

    // Returns null for a valid set of clues, otherwise a user-facing reason.
    public static String validateInitialBoard(int[][] board) {
        if (board == null || !isSupportedSize(board.length)) {
            return "must be 4x4, 9x9, or 16x16";
        }

        int size = board.length;
        for (int row = 0; row < size; row++) {
            if (board[row] == null || board[row].length != size) {
                return "must contain exactly " + size + " cells in every row";
            }

            for (int col = 0; col < size; col++) {
                int value = board[row][col];
                if (value < 0 || value > size) {
                    return "contains a value outside 0-" + size;
                }
                if (value == 0) {
                    continue;
                }

                board[row][col] = 0;
                boolean valid = isValidMove(board, row, col, value);
                board[row][col] = value;

                if (!valid) {
                    return "breaks Sudoku rules at row " + (row + 1)
                        + ", column " + (col + 1);
                }
            }
        }
        return null;
    }

    private static boolean isSupportedSize(int size) {
        return size == 4 || size == 9 || size == 16;
    }

    public static void printBoard(int[][] grid) {
        int size = grid.length;
        int boxSize = getBoxSize(size);
        int cellWidth = String.valueOf(size).length();
        String separator = buildSeparator(size, boxSize, cellWidth);

        for (int row = 0; row < size; row++) {
            if (row > 0 && row % boxSize == 0) {
                System.out.println(separator);
            }

            for (int col = 0; col < size; col++) {
                if (col > 0 && col % boxSize == 0) {
                    System.out.print("| ");
                }
                System.out.printf("%" + cellWidth + "d", grid[row][col]);
                if (col < size - 1) {
                    System.out.print(" ");
                }
            }
            System.out.println();
        }
    }

    private static String buildSeparator(int size, int boxSize, int cellWidth) {
        StringBuilder separator = new StringBuilder();
        for (int col = 0; col < size; col++) {
            if (col > 0 && col % boxSize == 0) {
                separator.append("+-");
            }
            for (int index = 0; index < cellWidth + 1; index++) {
                separator.append('-');
            }
        }
        return separator.toString();
    }

    public static int[][] copyBoard(int[][] original) {
        int[][] copy = new int[original.length][original.length];
        for (int row = 0; row < original.length; row++) {
            System.arraycopy(original[row], 0, copy[row], 0, original.length);
        }
        return copy;
    }

    public static void resetStats() {
        recursiveCalls = 0;
        backtrackCount = 0;
        solutionCount = 0;
        firstSolution = null;
    }

    public static boolean isValidMove(int[][] grid, int row, int col, int num) {
        int size = grid.length;
        for (int currentCol = 0; currentCol < size; currentCol++) {
            if (grid[row][currentCol] == num) {
                return false;
            }
        }

        for (int currentRow = 0; currentRow < size; currentRow++) {
            if (grid[currentRow][col] == num) {
                return false;
            }
        }

        int boxSize = getBoxSize(size);
        int startRow = boxSize * (row / boxSize);
        int startCol = boxSize * (col / boxSize);
        for (int r = startRow; r < startRow + boxSize; r++) {
            for (int c = startCol; c < startCol + boxSize; c++) {
                if (grid[r][c] == num) {
                    return false;
                }
            }
        }
        return true;
    }

    private static int getBoxSize(int size) {
        return (int) Math.sqrt(size);
    }

    public static List<Integer> getCandidates(int[][] grid, int row, int col) {
        List<Integer> candidates = new ArrayList<>();
        for (int num = 1; num <= grid.length; num++) {
            if (isValidMove(grid, row, col, num)) {
                candidates.add(num);
            }
        }
        return candidates;
    }

    private static Cell findMostConstrainedCell(int[][] grid) {
        Cell bestCell = null;
        int minimumCandidateCount = grid.length + 1;

        for (int row = 0; row < grid.length; row++) {
            for (int col = 0; col < grid.length; col++) {
                if (grid[row][col] != 0) {
                    continue;
                }

                int candidateCount = getCandidates(grid, row, col).size();
                if (candidateCount < minimumCandidateCount) {
                    minimumCandidateCount = candidateCount;
                    bestCell = new Cell(row, col);
                }
                if (candidateCount == 0) {
                    return bestCell;
                }
            }
        }
        return bestCell;
    }

    // Searches for at most two solutions using the MRV heuristic.
    // A true return value tells earlier calls to stop because two solutions exist.
    public static boolean solveSudokuWithMRV(int[][] grid) {
        recursiveCalls++;
        Cell cell = findMostConstrainedCell(grid);
        if (cell == null) {
            solutionCount++;

            // Save the first complete board before backtracking changes the grid.
            if (solutionCount == 1) {
                firstSolution = copyBoard(grid);
            }
            return solutionCount >= 2;
        }

        List<Integer> candidates = getCandidates(grid, cell.row, cell.col);
        for (int num : candidates) {
            grid[cell.row][cell.col] = num;

            boolean foundTwoSolutions = solveSudokuWithMRV(grid);

            // Always undo this choice, even when the search stops early.
            grid[cell.row][cell.col] = 0;
            if (foundTwoSolutions) {
                return true;
            }
            backtrackCount++;
        }
        return false;
    }
}
