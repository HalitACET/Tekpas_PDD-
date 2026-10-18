package com.tekpas.document.reading;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class DatesTest {

    @Test
    void dayFirstIsoAndNamedMonthsAreRead() {
        assertThat(Dates.all("31.03.2027")).containsExactly(LocalDate.of(2027, 3, 31));
        assertThat(Dates.all("01/02/2026 - 31/01/2027")).containsExactly(LocalDate.of(2026, 2, 1),
                LocalDate.of(2027, 1, 31));
        assertThat(Dates.all("2027-03-31")).containsExactly(LocalDate.of(2027, 3, 31));
        assertThat(Dates.all("14 January 2027")).containsExactly(LocalDate.of(2027, 1, 14));
        assertThat(Dates.all("31 Mart 2027, 1 Ağustos 2026")).containsExactly(LocalDate.of(2027, 3, 31),
                LocalDate.of(2026, 8, 1));
    }

    @Test
    void aDayFirstDateIsNeverReadMonthFirstAndImpossibleDatesAreDropped() {
        assertThat(Dates.all("03.04.2027")).containsExactly(LocalDate.of(2027, 4, 3));
        assertThat(Dates.all("31.02.2027")).isEmpty();
        assertThat(Dates.all("12.13.2027")).isEmpty();
        assertThat(Dates.all("no date here, 2027 only")).isEmpty();
    }
}
