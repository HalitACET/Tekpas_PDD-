package com.tekpas.batch;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class BatchNumbersTest {

    @Test
    void lettersRunLikeSpreadsheetColumns() {
        assertThat(BatchNumbers.letters(1)).isEqualTo("A");
        assertThat(BatchNumbers.letters(2)).isEqualTo("B");
        assertThat(BatchNumbers.letters(26)).isEqualTo("Z");
        assertThat(BatchNumbers.letters(27)).isEqualTo("AA");
        assertThat(BatchNumbers.letters(28)).isEqualTo("AB");
        assertThat(BatchNumbers.letters(702)).isEqualTo("ZZ");
        assertThat(BatchNumbers.letters(703)).isEqualTo("AAA");
    }

    @Test
    void sequenceIsTheInverseOfLetters() {
        for (int n = 1; n <= 2000; n++) {
            assertThat(BatchNumbers.sequence(BatchNumbers.letters(n))).isEqualTo(n);
        }
    }

    @Test
    void prefixHasYearMonthAndDayAndLeavesRoomWithinTwentyCharacters() {
        String prefix = BatchNumbers.prefix(LocalDate.of(2026, 1, 3));

        assertThat(prefix).isEqualTo("KP-2026-0103-");
        // Even the 18 278th batch of a day ("ZZZ") fits GS1 AI(10).
        assertThat(prefix + BatchNumbers.letters(18_278)).hasSizeLessThanOrEqualTo(20).matches("[A-Z0-9-]+");
    }
}
