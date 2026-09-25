package com.tekpas.common.config;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.lang.management.MemoryUsage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * One log line with the memory picture after startup, to check the 512 MB Render limit from the logs.
 * RSS and the cgroup limit are only available on Linux (the container); elsewhere they read "n/a".
 */
@Component
public class StartupReport {

    private static final Logger log = LoggerFactory.getLogger(StartupReport.class);
    private static final long MB = 1024 * 1024;

    @EventListener(ApplicationReadyEvent.class)
    void report(ApplicationReadyEvent event) {
        MemoryUsage heap = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        MemoryUsage nonHeap = ManagementFactory.getMemoryMXBean().getNonHeapMemoryUsage();
        log.info("Startup report: ready in {} ms, heap used {} MB / max {} MB, non-heap used {} MB, "
                        + "RSS {}, container limit {}, CPUs {}",
                event.getTimeTaken().toMillis(),
                heap.getUsed() / MB, heap.getMax() / MB, nonHeap.getUsed() / MB,
                rss().map(kb -> kb / 1024 + " MB").orElse("n/a"),
                cgroupLimit().map(bytes -> bytes / MB + " MB").orElse("n/a"),
                Runtime.getRuntime().availableProcessors());
    }

    private static Optional<Long> rss() {
        return read(Path.of("/proc/self/status")).flatMap(status -> status.lines()
                .filter(line -> line.startsWith("VmRSS:"))
                .map(line -> Long.parseLong(line.replaceAll("\\D", "")))
                .findFirst());
    }

    private static Optional<Long> cgroupLimit() {
        return read(Path.of("/sys/fs/cgroup/memory.max"))
                .or(() -> read(Path.of("/sys/fs/cgroup/memory/memory.limit_in_bytes")))
                .map(String::trim)
                .filter(value -> value.matches("\\d+"))
                .map(Long::parseLong);
    }

    private static Optional<String> read(Path path) {
        try {
            return Files.isReadable(path) ? Optional.of(Files.readString(path)) : Optional.empty();
        } catch (IOException e) {
            return Optional.empty();
        }
    }
}
