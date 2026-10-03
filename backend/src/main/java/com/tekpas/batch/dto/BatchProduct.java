package com.tekpas.batch.dto;

import java.util.UUID;

/** The product a batch belongs to. */
public record BatchProduct(UUID id, String name, String gtin) {
}
