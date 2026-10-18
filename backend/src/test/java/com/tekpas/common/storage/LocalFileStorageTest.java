package com.tekpas.common.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalFileStorageTest {

    @TempDir
    Path root;

    @Test
    void putWritesUnderTheRootAndNeverOverwrites() throws IOException {
        LocalFileStorage storage = new LocalFileStorage(root);

        storage.put("docs/c1/d1", new byte[] {1, 2, 3}, "application/pdf");

        assertThat(Files.readAllBytes(root.resolve("docs/c1/d1"))).containsExactly(1, 2, 3);
        assertThatThrownBy(() -> storage.put("docs/c1/d1", new byte[] {9}, "application/pdf"))
                .isInstanceOf(StorageException.class).hasMessage("Storage object already exists");
        assertThat(Files.readAllBytes(root.resolve("docs/c1/d1"))).containsExactly(1, 2, 3);
    }

    @Test
    void deleteIsIdempotent() {
        LocalFileStorage storage = new LocalFileStorage(root);
        storage.put("docs/c1/d1", new byte[] {1}, "application/pdf");

        storage.delete("docs/c1/d1");
        storage.delete("docs/c1/d1");

        assertThat(root.resolve("docs/c1/d1")).doesNotExist();
    }

    @Test
    void theLinkIsTheFileUriOfAnExistingKey() {
        LocalFileStorage storage = new LocalFileStorage(root);

        assertThat(storage.signedDownloadUrl("docs/c1/d1", Duration.ofSeconds(60), "x.pdf"))
                .isEqualTo(root.resolve("docs/c1/d1").toUri());
    }

    @Test
    void keysCannotLeaveTheRoot() {
        LocalFileStorage storage = new LocalFileStorage(root);

        for (String key : new String[] {"../outside", "docs/../../outside", "/etc/passwd", "C:/x", "docs\\..\\x"}) {
            assertThatThrownBy(() -> storage.put(key, new byte[1], "application/pdf")).as(key)
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(root.getParent().resolve("outside")).doesNotExist();
    }
}
