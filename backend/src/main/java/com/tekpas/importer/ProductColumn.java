package com.tekpas.importer;

import java.util.List;

/**
 * The columns of the product template (version 1), read by position, never by header: the header is in the
 * language the template was downloaded in. {@link #key()} names the column in a row error.
 */
enum ProductColumn {
    GTIN("gtin"),
    SKU("sku"),
    NAME("name"),
    CATEGORY("category"),
    DESCRIPTION("description"),
    FIBER_1("fiber1"),
    PERCENT_1("percent1"),
    FIBER_2("fiber2"),
    PERCENT_2("percent2"),
    FIBER_3("fiber3"),
    PERCENT_3("percent3");

    /** A whole composition's error (FiberTotal, FiberDuplicate) is the composition's, not one cell's. */
    static final String FIBERS = "fibers";

    static final List<ProductColumn> FIBER_COLUMNS = List.of(FIBER_1, FIBER_2, FIBER_3);

    private final String key;

    ProductColumn(String key) {
        this.key = key;
    }

    String key() {
        return key;
    }

    int index() {
        return ordinal();
    }

    /** The percentage column next to a fibre column. */
    ProductColumn percent() {
        return values()[ordinal() + 1];
    }
}
