package com.tekpas.passport;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class VerificationCodeTest {

    @Test
    void takesFortyBitsAsEightCharactersOfAnAlphabetWithoutLookAlikes() {
        // 0x00 … → all zero bits → the first alphabet character; 0xFF… → the last one.
        assertThat(VerificationCode.of("0".repeat(64))).isEqualTo("2222-2222");
        assertThat(VerificationCode.of("f".repeat(64))).isEqualTo("ZZZZ-ZZZZ");
    }

    @Test
    void sameContentSameCodeAndNoLookAlikeCharacters() {
        String hash = "7c4a8d09ca3762af61e59520943dc26494f8941b8b2b4a7d0e8d7e8d0f0a1b2c";

        assertThat(VerificationCode.of(hash)).isEqualTo(VerificationCode.of(hash)).matches("[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}")
                .doesNotContain("0", "1", "O", "I");
        assertThat(VerificationCode.of(hash)).isNotEqualTo(VerificationCode.of("8" + hash.substring(1)));
    }
}
