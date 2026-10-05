package com.tekpas.supplychain.dto;

import com.tekpas.company.CompanyType;
import java.util.UUID;
import org.jspecify.annotations.Nullable;

/** The supplier assigned to a step, as the chain node shows it. */
public record StepSupplier(UUID id, String name, @Nullable String city, CompanyType type) {
}
