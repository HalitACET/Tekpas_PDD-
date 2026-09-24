package com.tekpas.common.config;

import com.tekpas.common.error.ApiProblem;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Every endpoint requires a bearer token unless it opts out with an empty {@code @SecurityRequirements}. */
@Configuration
@OpenAPIDefinition(
        info = @Info(title = "TekPas API", version = "v1",
                description = "Digital Product Passport platform for textile manufacturers"),
        security = @SecurityRequirement(name = OpenApiConfig.BEARER_AUTH))
@SecurityScheme(name = OpenApiConfig.BEARER_AUTH, type = SecuritySchemeType.HTTP, scheme = "bearer",
        bearerFormat = "JWT")
public class OpenApiConfig {

    public static final String BEARER_AUTH = "bearerAuth";
    private static final String PROBLEM_JSON = "application/problem+json";

    /**
     * Every 4xx/5xx response is documented as {@link ApiProblem} (springdoc would otherwise reuse the
     * success schema), so controllers only state which error codes can happen.
     */
    @Bean
    OpenApiCustomizer problemResponses(NonNullByDefaultModelConverter nonNullByDefault) {
        // A fresh instance with our converter, so ApiProblem follows the same nullability rule.
        ModelConverters converters = new ModelConverters();
        converters.addConverter(nonNullByDefault);
        return openApi -> {
            converters.readAll(ApiProblem.class)
                    .forEach((name, schema) -> openApi.getComponents().addSchemas(name, schema));
            Schema<?> ref = new Schema<>().$ref("#/components/schemas/ApiProblem");

            openApi.getPaths().values().forEach(path -> path.readOperations().forEach(operation ->
                    operation.getResponses().forEach((code, response) -> {
                        if (isError(code)) {
                            response.setContent(new Content().addMediaType(PROBLEM_JSON,
                                    new MediaType().schema(ref)));
                        }
                    })));
        };
    }

    private static boolean isError(String code) {
        return code.startsWith("4") || code.startsWith("5");
    }
}
