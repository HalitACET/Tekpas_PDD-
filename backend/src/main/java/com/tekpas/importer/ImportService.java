package com.tekpas.importer;

import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import com.tekpas.common.error.NotFoundException;
import com.tekpas.importer.dto.ImportResponse;
import com.tekpas.jobs.JobQueue;
import com.tekpas.jobs.JobType;
import java.util.List;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Excel imports (docs/m11-plan.md §4): the template, an upload checked and queued, and the result. Only products for
 * now; the kind is in the API so another can come. Another company's import is a 404.
 */
@Service
public class ImportService {

    static final String PRODUCTS = "products";
    static final int LIST_SIZE = 20;

    /** What the IMPORT_EXCEL job carries. */
    record Payload(UUID companyId, UUID importId) {
    }

    private final ImportStore store;
    private final JobQueue queue;

    ImportService(ImportStore store, JobQueue queue) {
        this.store = store;
        this.queue = queue;
    }

    public byte[] template(String kind, @Nullable String language) {
        requireKind(kind);
        return ProductTemplate.write(language == null ? "tr" : language);
    }

    @Transactional
    public ImportResponse upload(UUID companyId, UUID userId, String kind, @Nullable String fileName, byte[] file) {
        requireKind(kind);
        ImportFiles.check(file);
        UUID id = UUID.randomUUID();
        store.insert(id, companyId, "PRODUCTS", displayName(fileName), file, userId);
        // Same transaction: no row, no job; the worker starts right after the commit.
        queue.enqueue(JobType.IMPORT_EXCEL, new Payload(companyId, id));
        return store.get(companyId, id).orElseThrow();
    }

    @Transactional(readOnly = true)
    public ImportResponse get(UUID companyId, UUID id) {
        return store.get(companyId, id).orElseThrow(() -> new NotFoundException("Import not found"));
    }

    @Transactional(readOnly = true)
    public List<ImportResponse> list(UUID companyId) {
        return store.list(companyId, LIST_SIZE);
    }

    private static void requireKind(String kind) {
        if (!PRODUCTS.equals(kind)) {
            throw new InvalidFieldsException(new FieldViolation("kind", "ImportKind", "Only products can be imported"));
        }
    }

    /** The name as shown in the history: no path, at most 200 characters. */
    static String displayName(@Nullable String fileName) {
        String name = fileName == null ? "" : fileName.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("\\p{Cntrl}", "").strip();
        if (name.isEmpty()) {
            name = "import.xlsx";
        }
        return name.length() > 200 ? name.substring(0, 200) : name;
    }
}
