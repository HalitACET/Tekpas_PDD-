package com.tekpas.importer;

import com.tekpas.importer.ImportService.Payload;
import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import java.time.Clock;
import java.time.Duration;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * {@code IMPORT_EXCEL} (one attempt): reads the uploaded file, creates a product per valid row, stores the result and
 * drops the file. A file that is not the template, too long or unreadable ends FAILED with its code. Running it again
 * does nothing: only a QUEUED import is taken.
 */
@Component
class ImportExcelJob implements JobHandler<Payload> {

    private static final Logger log = LoggerFactory.getLogger(ImportExcelJob.class);

    private final ImportStore store;
    private final ProductImport products;
    private final Clock clock;

    ImportExcelJob(ImportStore store, ProductImport products, Clock clock) {
        this.store = store;
        this.products = products;
        this.clock = clock;
    }

    @Override
    public JobType type() {
        return JobType.IMPORT_EXCEL;
    }

    @Override
    public Class<Payload> payloadType() {
        return Payload.class;
    }

    @Override
    public Duration timeout() {
        return Duration.ofMinutes(3);
    }

    @Override
    public void handle(Payload payload, JobContext context) {
        Optional<byte[]> file = store.start(payload.companyId(), payload.importId());
        if (file.isEmpty()) {
            return;
        }
        try {
            ProductImport.Result result = products.run(payload.companyId(), file.get());
            store.done(payload.companyId(), payload.importId(), result.total(), result.created(), result.failed(),
                    result.errors(), clock.instant());
            log.info("Import {}: {} rows, {} created, {} failed", payload.importId(), result.total(), result.created(),
                    result.failed());
        } catch (ProductImport.Refused e) {
            store.failed(payload.companyId(), payload.importId(), e.code(), clock.instant());
            log.info("Import {} refused: {}", payload.importId(), e.code());
        }
    }

    @Override
    public void onGiveUp(Payload payload, String reason) {
        store.failed(payload.companyId(), payload.importId(), "UNREADABLE", clock.instant());
    }
}
