package com.example.sudoku.core;

import java.util.Arrays;

public enum Difficulty {
    EASY("Easy", 40),
    MEDIUM("Medium", 32),
    HARD("Hard", 26);

    private final String displayName;
    private final int clueCount;

    Difficulty(String displayName, int clueCount) {
        this.displayName = displayName;
        this.clueCount = clueCount;
    }

    public String displayName() {
        return displayName;
    }

    public int clueCount() {
        return clueCount;
    }

    public static Difficulty from(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Difficulty is required. Use Easy, Medium, or Hard.");
        }

        return Arrays.stream(values())
            .filter(difficulty -> difficulty.displayName.equalsIgnoreCase(value.trim()))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException(
                "Unsupported difficulty. Use Easy, Medium, or Hard."));
    }
}
