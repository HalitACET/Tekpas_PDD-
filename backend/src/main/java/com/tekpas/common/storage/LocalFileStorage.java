package com.tekpas.common.storage;

import java.io.IOException;
import java.net.URI;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.stream.Stream;
import org.jspecify.annotations.Nullable;

/**
 * Development and test storage on the local disk. There is no signing: the "link" is the file's own URI,
 * so a browser cannot follow it (the download endpoint of M5 T2 decides what local development does with it).
 */
final class LocalFileStorage implements FileStorage {

    private final Path root;

    LocalFileStorage(Path root) {
        this.root = root.toAbsolutePath().normalize();
    }

    @Override
    public void put(String key, byte[] content, String contentType) {
        Path target = pathOf(key);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, content, java.nio.file.StandardOpenOption.CREATE_NEW);
        } catch (FileAlreadyExistsException e) {
            throw new StorageException("Storage object already exists", e);
        } catch (IOException e) {
            throw new StorageException("Local storage write failed", e);
        }
    }

    @Override
    public URI signedDownloadUrl(String key, Duration ttl, @Nullable String downloadName) {
        return pathOf(key).toUri();
    }

    @Override
    public byte[] read(String key) {
        try {
            return Files.readAllBytes(pathOf(key));
        } catch (java.nio.file.NoSuchFileException e) {
            throw new MissingObjectException();
        } catch (IOException e) {
            throw new StorageException("Local storage read failed", e);
        }
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(pathOf(key));
        } catch (IOException e) {
            throw new StorageException("Local storage delete failed", e);
        }
    }

    @Override
    public List<StoredObject> list(String prefix) {
        Path folder = pathOf(prefix);
        if (!Files.isDirectory(folder)) {
            return List.of();
        }
        try (Stream<Path> files = Files.walk(folder)) {
            return files.filter(Files::isRegularFile).map(this::objectOf).toList();
        } catch (IOException | java.io.UncheckedIOException e) {
            throw new StorageException("Local storage listing failed", e);
        }
    }

    private StoredObject objectOf(Path file) {
        try {
            String key = root.relativize(file).toString().replace(java.io.File.separatorChar, '/');
            return new StoredObject(key, Files.getLastModifiedTime(file).toInstant());
        } catch (IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    Path pathOf(String key) {
        Path path = root.resolve(StorageKeys.require(key)).normalize();
        if (!path.startsWith(root)) {
            throw new IllegalArgumentException("Invalid storage key");
        }
        return path;
    }
}
