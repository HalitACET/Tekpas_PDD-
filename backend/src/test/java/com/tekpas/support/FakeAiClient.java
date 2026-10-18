package com.tekpas.support;

import com.tekpas.ai.AiClient;
import com.tekpas.ai.AiException;
import com.tekpas.ai.AiRequest;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;

/**
 * Stands in for the LLM in every test (no real call, ever): records each request and answers with what the test
 * queued, a recorded answer or an {@link AiException}. Nothing queued means an empty JSON object.
 */
public class FakeAiClient implements AiClient {

    public static final String MODEL = "fake-model";

    private final List<AiRequest> requests = new CopyOnWriteArrayList<>();
    private final Deque<Supplier<String>> answers = new ArrayDeque<>();

    @Override
    public String model() {
        return MODEL;
    }

    @Override
    public synchronized String generateJson(AiRequest request) {
        requests.add(request);
        Supplier<String> next = answers.size() > 1 ? answers.poll() : answers.peek();
        return next == null ? "{}" : next.get();
    }

    /** Answers with {@code json}; the last queued answer repeats. */
    public synchronized FakeAiClient answer(String json) {
        answers.add(() -> json);
        return this;
    }

    /** Fails with {@code kind}; the last queued answer repeats. */
    public synchronized FakeAiClient fail(AiException.Kind kind) {
        answers.add(() -> {
            throw new AiException(kind, "LLM call failed (fake " + kind + ")");
        });
        return this;
    }

    public List<AiRequest> requests() {
        return List.copyOf(requests);
    }

    public int calls() {
        return requests.size();
    }

    public synchronized void reset() {
        requests.clear();
        answers.clear();
    }
}
