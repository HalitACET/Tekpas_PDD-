package com.tekpas.common.config;

import io.swagger.v3.core.converter.AnnotatedType;
import io.swagger.v3.core.converter.ModelConverter;
import io.swagger.v3.core.converter.ModelConverterContext;
import io.swagger.v3.oas.models.media.Schema;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.util.Arrays;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Nullability rule for the API contract: every component of our DTO records is required in the OpenAPI
 * schema unless it is annotated {@link Nullable}. The generated TypeScript client then has
 * {@code id: string} instead of {@code id?: string}.
 */
@Component
public class NonNullByDefaultModelConverter implements ModelConverter {

    private static final String OWN_PACKAGE = "com.tekpas.";
    private static final Pattern SIMPLE_TYPE = Pattern.compile("(?:\\[simple type, class )?([\\w.$]+)]?");

    @Override
    @SuppressWarnings("rawtypes")
    public @Nullable Schema resolve(AnnotatedType type, ModelConverterContext context,
            Iterator<ModelConverter> chain) {
        Schema resolved = chain.hasNext() ? chain.next().resolve(type, context, chain) : null;
        Class<?> record = ownRecord(type.getType());
        if (resolved == null || record == null) {
            return resolved;
        }

        Schema model = resolved.get$ref() == null ? resolved : definedModel(context, resolved.get$ref());
        if (model != null && model.getProperties() != null) {
            Map<?, ?> properties = model.getProperties();
            List<String> required = Arrays.stream(record.getRecordComponents())
                    .filter(component -> !isNullable(component))
                    .map(RecordComponent::getName)
                    .filter(properties::containsKey)
                    .toList();
            model.setRequired(required.isEmpty() ? null : required);
        }
        return resolved;
    }

    private static boolean isNullable(RecordComponent component) {
        // JSpecify's @Nullable is a type-use annotation: it sits on the component's type, not on the component.
        return component.getAnnotatedType().isAnnotationPresent(Nullable.class);
    }

    @SuppressWarnings("rawtypes")
    private static @Nullable Schema definedModel(ModelConverterContext context, String ref) {
        return context.getDefinedModels().get(ref.substring(ref.lastIndexOf('/') + 1));
    }

    /**
     * swagger-core passes either a Class or its own (Jackson 2) JavaType, whose name looks like
     * {@code [simple type, class com.tekpas.X]}. Reading the class name avoids depending on Jackson 2 here.
     */
    private static @Nullable Class<?> ownRecord(Type type) {
        String name;
        if (type instanceof Class<?> c) {
            name = c.getName();
        } else {
            Matcher simple = SIMPLE_TYPE.matcher(type.getTypeName());
            if (!simple.matches()) {
                return null;
            }
            name = simple.group(1);
        }
        if (!name.startsWith(OWN_PACKAGE)) {
            return null;
        }
        try {
            Class<?> candidate = Class.forName(name, false, NonNullByDefaultModelConverter.class.getClassLoader());
            return candidate.isRecord() ? candidate : null;
        } catch (ClassNotFoundException e) {
            return null;
        }
    }
}
