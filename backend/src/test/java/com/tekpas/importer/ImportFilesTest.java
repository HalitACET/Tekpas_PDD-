package com.tekpas.importer;

import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.Test;

/** The upload checks accept the template we hand out, in every language. */
class ImportFilesTest {

    @Test
    void theTemplatePassesTheUploadChecks() {
        for (String language : ImportTexts.LANGUAGES) {
            assertThatCode(() -> ImportFiles.check(ProductTemplate.write(language))).doesNotThrowAnyException();
        }
    }
}
