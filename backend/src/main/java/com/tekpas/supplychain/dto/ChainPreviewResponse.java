package com.tekpas.supplychain.dto;

import org.jspecify.annotations.Nullable;

/**
 * What a new batch of the product starts with (design 08: "Tedarik zinciri: 5 adım kopyalanacak").
 *
 * @param sourceBatchNo the batch whose chain is copied; null when the default chain is used
 */
public record ChainPreviewResponse(int stepCount, @Nullable String sourceBatchNo) {
}
