package com.example.sudoku.api;

public record SudokuResponse(
    String difficulty,
    int[][] puzzle,
    int[][] solution,
    double responseTimeMs
) {
}
