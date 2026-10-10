package com.tekpas.common.web;

import com.tekpas.common.error.TooManyRequestsException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * Fixed-window counters in memory. Render runs a single instance (free tier), so no shared store is needed; a
 * restart resets the counters, which is acceptable for abuse limits.
 */
@Component
public class RateLimiter {

    /** Above this many keys the expired windows are dropped. */
    private static final int SWEEP_AT = 10_000;

    private record Window(Instant end, int count) {
    }

    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final Clock clock;

    public RateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** Counts one hit; throws 429 once {@code limit} hits fall in the current window. */
    public void hit(String bucket, String key, int limit, Duration window) {
        Window current = count(bucket + ":" + key, window, 1);
        if (current.count() > limit) {
            throw tooMany(current);
        }
    }

    /** 429 if the key already used up the window, without counting. */
    public void check(String bucket, String key, int limit, Duration window) {
        Window current = count(bucket + ":" + key, window, 0);
        if (current.count() >= limit) {
            throw tooMany(current);
        }
    }

    private Window count(String key, Duration length, int add) {
        Instant now = clock.instant();
        if (windows.size() > SWEEP_AT) {
            windows.values().removeIf(w -> !now.isBefore(w.end()));
        }
        return windows.compute(key, (k, w) -> w == null || !now.isBefore(w.end())
                ? new Window(now.plus(length), add)
                : new Window(w.end(), w.count() + add));
    }

    private TooManyRequestsException tooMany(Window window) {
        return new TooManyRequestsException(Duration.between(clock.instant(), window.end()).toSeconds() + 1);
    }
}
