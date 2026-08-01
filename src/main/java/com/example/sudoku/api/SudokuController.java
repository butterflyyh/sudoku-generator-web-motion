package com.example.sudoku.api;

import com.example.sudoku.core.Difficulty;
import com.example.sudoku.core.GeneratedSudoku;
import com.example.sudoku.core.SudokuGenerator;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sudoku")
public class SudokuController {
    private final SudokuGenerator generator;

    public SudokuController(SudokuGenerator generator) {
        this.generator = generator;
    }

    @GetMapping("/generate")
    public SudokuResponse generate(
        @RequestParam(defaultValue = "Medium") String difficulty
    ) {
        Difficulty requestedDifficulty = Difficulty.from(difficulty);
        GeneratedSudoku generated = generator.generate(requestedDifficulty);

        return new SudokuResponse(
            requestedDifficulty.displayName(),
            generated.puzzle(),
            generated.solution(),
            generated.responseTimeMs()
        );
    }
}
