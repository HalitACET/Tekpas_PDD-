package com.tekpas.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.tekpas.support.IntegrationTest;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * The role matrix (PLAN.md §2, docs/m12-plan.md §4) as it is enforced: every API endpoint with its access level,
 * compared with {@code access-matrix.txt}. A new endpoint fails this test until it is added there, so nobody ships
 * an endpoint without deciding who may call it.
 *
 * <p>Levels: PUBLIC (no login), AUTHENTICATED (any logged-in user, suppliers included), READ (OWNER, ADMIN, EDITOR,
 * VIEWER), WRITE (OWNER, ADMIN, EDITOR), REVIEW (OWNER, ADMIN), OWNER.
 */
@IntegrationTest
class AccessMatrixTest {

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping mapping;

    @Test
    void everyEndpointHasTheAccessOfTheRoleMatrix() throws IOException {
        Map<String, String> actual = new TreeMap<>();
        mapping.getHandlerMethods().forEach((info, method) -> {
            for (String path : paths(info)) {
                if (!path.startsWith("/api/")) {
                    continue;
                }
                for (RequestMethod verb : info.getMethodsCondition().getMethods()) {
                    actual.put(path + " " + verb, level(path, method));
                }
            }
        });
        String found = actual.entrySet().stream().map(e -> e.getKey() + " " + e.getValue())
                .collect(Collectors.joining("\n", "", "\n"));
        // Handy when the table needs updating: the endpoints as they are now.
        Files.writeString(Path.of("target", "access-matrix.actual.txt"), found);

        assertThat(found).isEqualTo(expected());
    }

    private static Set<String> paths(RequestMappingInfo info) {
        return info.getPathPatternsCondition() != null ? info.getPathPatternsCondition().getPatternValues()
                : info.getPatternValues();
    }

    private static String level(String path, HandlerMethod method) {
        AntPathMatcher matcher = new AntPathMatcher();
        for (String open : SecurityConfig.PUBLIC_PATHS) {
            if (matcher.match(open, path)) {
                return "PUBLIC";
            }
        }
        if (has(method, OwnerAccess.class)) {
            return "OWNER";
        }
        if (has(method, ReviewAccess.class)) {
            return "REVIEW";
        }
        if (has(method, WriteAccess.class)) {
            return "WRITE";
        }
        if (has(method, ReadAccess.class)) {
            return "READ";
        }
        return "AUTHENTICATED";
    }

    /** On the method, or else on the class (a method's own annotation wins, as in Spring Security). */
    private static boolean has(HandlerMethod method, Class<? extends java.lang.annotation.Annotation> type) {
        boolean onMethod = AnnotatedElementUtils.hasAnnotation(method.getMethod(), type);
        boolean anyOnMethod = AnnotatedElementUtils.hasAnnotation(method.getMethod(), OwnerAccess.class)
                || AnnotatedElementUtils.hasAnnotation(method.getMethod(), ReviewAccess.class)
                || AnnotatedElementUtils.hasAnnotation(method.getMethod(), WriteAccess.class)
                || AnnotatedElementUtils.hasAnnotation(method.getMethod(), ReadAccess.class);
        return onMethod || (!anyOnMethod && AnnotatedElementUtils.hasAnnotation(method.getBeanType(), type));
    }

    private static String expected() throws IOException {
        try (InputStream in = AccessMatrixTest.class.getResourceAsStream("/access-matrix.txt")) {
            assertThat(in).as("src/test/resources/access-matrix.txt").isNotNull();
            return new String(in.readAllBytes(), StandardCharsets.UTF_8).lines()
                    .filter(l -> !l.isBlank() && !l.startsWith("#"))
                    .collect(Collectors.joining("\n", "", "\n"));
        }
    }
}
