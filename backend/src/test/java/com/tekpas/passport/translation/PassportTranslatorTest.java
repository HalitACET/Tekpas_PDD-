package com.tekpas.passport.translation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** The model's translations are untrusted input (docs/m11-plan.md §3): plain text of a sensible length only. */
class PassportTranslatorTest {

    @Test
    void keepsPlainTextAndDropsMarkupLinksAndRunawayLengths() {
        assertThat(PassportTranslator.clean("  Single jersey ", 6)).isEqualTo("Single jersey");
        assertThat(PassportTranslator.clean("Bio\u0000Baumwolle\nPolo", 20)).isEqualTo("Bio Baumwolle\nPolo");
        assertThat(PassportTranslator.clean("<script>x</script>", 20)).isNull();
        assertThat(PassportTranslator.clean("See https://example.com", 30)).isNull();
        assertThat(PassportTranslator.clean("visit www.example.com", 30)).isNull();
        assertThat(PassportTranslator.clean("   ", 10)).isNull();
        // At most three times the source and some slack: a translation, not another text.
        assertThat(PassportTranslator.clean("x".repeat(3 * 10 + 40), 10)).isNotNull();
        assertThat(PassportTranslator.clean("x".repeat(3 * 10 + 41), 10)).isNull();
        assertThat(PassportTranslator.clean("x".repeat(2001), 2000)).isNull();
    }
}
