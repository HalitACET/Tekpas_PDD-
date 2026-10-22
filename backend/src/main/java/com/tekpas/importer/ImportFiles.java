package com.tekpas.importer;

import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import org.dhatim.fastexcel.reader.ReadableWorkbook;

/**
 * What an uploaded file must be before it is stored (docs/m11-plan.md §4): an .xlsx of at most 1 MB, judged by its
 * content, not its name. An .xls, a macro workbook (.xlsm, a VBA part) or a ZIP that unpacks into far more than it
 * weighs (a zip bomb) is refused here; the reader never sees it. Field errors on {@code file}: FileSize, FileType,
 * FileMacro, FileUnsafe.
 */
final class ImportFiles {

    static final int MAX_BYTES = 1024 * 1024;
    static final int MAX_ENTRIES = 200;
    static final long MAX_UNPACKED = 40L * 1024 * 1024;
    private static final String SPREADSHEET = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";

    private ImportFiles() {
    }

    static void check(byte[] bytes) {
        if (bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw refused("FileSize", "An .xlsx file of at most 1 MB");
        }
        if (!ReadableWorkbook.isOOXMLZipHeader(Arrays.copyOf(bytes, Math.min(bytes.length, 8)))) {
            throw refused("FileType", "Only .xlsx files (the KozaPass template)");
        }
        String contentTypes = null;
        int entries = 0;
        long unpacked = 0;
        Path temp = null;
        // ZipFile reads the central directory (an .xlsx may store parts with data descriptors, which ZipInputStream
        // cannot read); the unpacked size is still counted from the bytes actually read, never from the headers.
        try {
            temp = Files.createTempFile("import-", ".xlsx");
            Files.write(temp, bytes);
            try (ZipFile zip = new ZipFile(temp.toFile(), StandardCharsets.UTF_8)) {
                byte[] buffer = new byte[8192];
                for (ZipEntry entry : java.util.Collections.list(zip.entries())) {
                    if (++entries > MAX_ENTRIES) {
                        throw refused("FileUnsafe", "The file has too many parts");
                    }
                    String name = entry.getName();
                    if (name.contains("..") || name.startsWith("/") || name.contains("\\")) {
                        throw refused("FileUnsafe", "The file has a part outside the workbook");
                    }
                    if (name.toLowerCase(Locale.ROOT).endsWith("vbaproject.bin")) {
                        throw refused("FileMacro", "Workbooks with macros are not accepted");
                    }
                    ByteArrayOutputStream part = name.equals("[Content_Types].xml") ? new ByteArrayOutputStream() : null;
                    try (InputStream in = zip.getInputStream(entry)) {
                        int n;
                        while ((n = in.read(buffer)) > 0) {
                            unpacked += n;
                            if (unpacked > MAX_UNPACKED) {
                                throw refused("FileUnsafe", "The file unpacks into too much data");
                            }
                            if (part != null) {
                                part.write(buffer, 0, n);
                            }
                        }
                    }
                    if (part != null) {
                        contentTypes = part.toString(StandardCharsets.UTF_8);
                    }
                }
            }
        } catch (IOException | IllegalArgumentException e) {
            throw refused("FileType", "The file is not a readable .xlsx");
        } finally {
            if (temp != null) {
                try {
                    Files.deleteIfExists(temp);
                } catch (IOException ignored) {
                    // the temporary directory is cleaned by the platform
                }
            }
        }
        if (contentTypes == null) {
            throw refused("FileType", "The file is not a readable .xlsx");
        }
        if (contentTypes.toLowerCase(Locale.ROOT).contains("macroenabled")) {
            throw refused("FileMacro", "Workbooks with macros are not accepted");
        }
        if (!contentTypes.contains(SPREADSHEET)) {
            throw refused("FileType", "Only .xlsx files (the KozaPass template)");
        }
    }

    private static InvalidFieldsException refused(String code, String message) {
        return new InvalidFieldsException(new FieldViolation("file", code, message));
    }
}
