package com.example.sudoku;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.stream.Stream;

import com.example.sudoku.core.SudokuGenerator;
import com.example.sudoku.core.SudokuSolver;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class SudokuApplicationTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void contextLoads() {
        assertThat(mockMvc).isNotNull();
    }

    @Test
    void healthEndpointReportsUp() throws Exception {
        mockMvc.perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("application/json"))
            .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void homePageIsServed() throws Exception {
        mockMvc.perform(get("/"))
            .andExpect(status().isOk())
            .andExpect(forwardedUrl("index.html"));

        mockMvc.perform(get("/index.html"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/html"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("Sudoku Generator")));
    }

    @Test
    void manualSolverPagesContainBackNavigationAndGameControls() throws Exception {
        mockMvc.perform(get("/difficulty.html"))
            .andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.allOf(
                org.hamcrest.Matchers.containsString("data-back-button"),
                org.hamcrest.Matchers.containsString("data-fallback=\"index.html\""),
                org.hamcrest.Matchers.containsString("<script src=\"script.js\"></script>"))));

        mockMvc.perform(get("/result.html?difficulty=Easy"))
            .andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.allOf(
                org.hamcrest.Matchers.containsString("data-fallback=\"difficulty.html\""),
                org.hamcrest.Matchers.containsString("id=\"game-timer\""),
                org.hamcrest.Matchers.containsString("id=\"check-button\""),
                org.hamcrest.Matchers.containsString("id=\"hint-button\""),
                org.hamcrest.Matchers.containsString("id=\"reset-button\""),
                org.hamcrest.Matchers.containsString("id=\"erase-button\""),
                org.hamcrest.Matchers.containsString("Back to Home"))));
    }

    @Test
    void staticStylesAndJavaScriptAreServed() throws Exception {
        mockMvc.perform(get("/styles.css"))
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("text/css"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString(".sudoku-grid")));

        mockMvc.perform(get("/script.js"))
            .andExpect(status().isOk())
            .andExpect(content().string(org.hamcrest.Matchers.containsString(
                "/api/sudoku/generate")));
    }

    @ParameterizedTest(name = "{0} API returns a complete, unique puzzle")
    @MethodSource("difficulties")
    void generateEndpointReturnsCompleteUniquePuzzle(
        String difficulty,
        int expectedClues
    ) throws Exception {
        MvcResult result = mockMvc.perform(
                get("/api/sudoku/generate").param("difficulty", difficulty)
            )
            .andExpect(status().isOk())
            .andExpect(content().contentTypeCompatibleWith("application/json"))
            .andExpect(jsonPath("$.difficulty").value(difficulty))
            .andExpect(jsonPath("$.puzzle").isArray())
            .andExpect(jsonPath("$.puzzle.length()").value(9))
            .andExpect(jsonPath("$.solution").isArray())
            .andExpect(jsonPath("$.solution.length()").value(9))
            .andExpect(jsonPath("$.responseTimeMs").isNumber())
            .andReturn();

        String json = result.getResponse().getContentAsString();
        List<List<Integer>> puzzleJson = JsonPath.read(json, "$.puzzle");
        List<List<Integer>> solutionJson = JsonPath.read(json, "$.solution");
        Number responseTimeMs = JsonPath.read(json, "$.responseTimeMs");
        int[][] puzzle = toBoard(puzzleJson);
        int[][] solution = toBoard(solutionJson);

        assertThat(responseTimeMs.doubleValue()).isPositive();
        assertThat(SudokuGenerator.countClues(puzzle)).isEqualTo(expectedClues);
        assertThat(SudokuSolver.countSolutions(SudokuSolver.copyBoard(puzzle), 2)).isEqualTo(1);
        assertSolvedBoardIsValid(solution);
        assertPuzzleMatchesSolution(puzzle, solution);
    }

    @Test
    void unsupportedDifficultyReturnsHelpfulBadRequest() throws Exception {
        mockMvc.perform(get("/api/sudoku/generate").param("difficulty", "Impossible"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(
                "Unsupported difficulty. Use Easy, Medium, or Hard."));
    }

    private static Stream<Arguments> difficulties() {
        return Stream.of(
            Arguments.of("Easy", 40),
            Arguments.of("Medium", 32),
            Arguments.of("Hard", 26)
        );
    }

    private static int[][] toBoard(List<List<Integer>> values) {
        assertThat(values).hasSize(9);
        int[][] board = new int[9][9];
        for (int row = 0; row < 9; row++) {
            assertThat(values.get(row)).hasSize(9);
            for (int col = 0; col < 9; col++) {
                board[row][col] = values.get(row).get(col);
            }
        }
        return board;
    }

    private static void assertSolvedBoardIsValid(int[][] board) {
        for (int index = 0; index < 9; index++) {
            int rowMask = 0;
            int columnMask = 0;
            for (int offset = 0; offset < 9; offset++) {
                rowMask |= 1 << board[index][offset];
                columnMask |= 1 << board[offset][index];
            }
            assertThat(rowMask).isEqualTo(0b11_1111_1110);
            assertThat(columnMask).isEqualTo(0b11_1111_1110);
        }

        for (int boxRow = 0; boxRow < 3; boxRow++) {
            for (int boxCol = 0; boxCol < 3; boxCol++) {
                int boxMask = 0;
                for (int row = boxRow * 3; row < boxRow * 3 + 3; row++) {
                    for (int col = boxCol * 3; col < boxCol * 3 + 3; col++) {
                        boxMask |= 1 << board[row][col];
                    }
                }
                assertThat(boxMask).isEqualTo(0b11_1111_1110);
            }
        }
    }

    private static void assertPuzzleMatchesSolution(int[][] puzzle, int[][] solution) {
        for (int row = 0; row < 9; row++) {
            for (int col = 0; col < 9; col++) {
                if (puzzle[row][col] != 0) {
                    assertThat(puzzle[row][col]).isEqualTo(solution[row][col]);
                }
            }
        }
    }
}
