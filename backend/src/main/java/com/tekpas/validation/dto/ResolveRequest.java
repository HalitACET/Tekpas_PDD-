package com.tekpas.validation.dto;

import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/** Why a person lets a warning stand; optional. */
public record ResolveRequest(@Nullable @Size(max = 500) String note) {
}
