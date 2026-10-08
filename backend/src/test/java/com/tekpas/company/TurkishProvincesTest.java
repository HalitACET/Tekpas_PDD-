package com.tekpas.company;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Collator;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class TurkishProvincesTest {

    /** The single source; the web app and the shared Zod schema read the same file. */
    static final Path SHARED = Path.of("..", "packages", "shared", "src", "tr-provinces.json");

    @Test
    void equalsTheSharedList() throws IOException {
        List<String> shared = List.of(JsonMapper.builder().build().readValue(Files.readString(SHARED), String[].class));

        assertThat(TurkishProvinces.ALL).containsExactlyElementsOf(shared);
    }

    @Test
    void hasEightyOneProvincesInTurkishAlphabeticalOrder() {
        List<String> sorted = new ArrayList<>(TurkishProvinces.ALL);
        sorted.sort(Collator.getInstance(Locale.forLanguageTag("tr")));

        assertThat(TurkishProvinces.ALL).hasSize(81).doesNotHaveDuplicates().containsExactlyElementsOf(sorted);
        assertThat(TurkishProvinces.ALL.indexOf("Çanakkale")).isEqualTo(TurkishProvinces.ALL.indexOf("Bursa") + 1);
        assertThat(TurkishProvinces.ALL.indexOf("İstanbul")).isEqualTo(TurkishProvinces.ALL.indexOf("Isparta") + 1);
    }
}
