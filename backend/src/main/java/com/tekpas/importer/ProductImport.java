package com.tekpas.importer;

import com.tekpas.common.error.ConflictException;
import com.tekpas.product.Fiber;
import com.tekpas.product.FiberShare;
import com.tekpas.product.Gtin;
import com.tekpas.product.ProductCategory;
import com.tekpas.product.ProductService;
import com.tekpas.product.dto.ProductCreateRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.dhatim.fastexcel.reader.Cell;
import org.dhatim.fastexcel.reader.ReadableWorkbook;
import org.dhatim.fastexcel.reader.Row;
import org.dhatim.fastexcel.reader.Sheet;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Reads the product template and creates a product per valid row (docs/m11-plan.md §4). Each row goes through the
 * API's own rules (the {@link ProductCreateRequest} constraints, same error codes) and is saved on its own: a bad row
 * does not stop the others. A GTIN twice in the file is {@code Duplicate}, one the company already has {@code Unique}.
 * Formulas are not evaluated: a cell's stored value is what counts.
 */
@Component
class ProductImport {

    /** Why the whole file is refused, stored as the import's failure code. */
    static final class Refused extends RuntimeException {

        private final String code;

        Refused(String code) {
            super(code, null, false, false);
            this.code = code;
        }

        String code() {
            return code;
        }
    }

    /** One problem of one row: the spreadsheet row number (header is 1), the column's key, the code, the value. */
    record RowError(int row, String column, String code, @Nullable String value) {
    }

    record Result(int total, int created, List<RowError> errors) {

        int failed() {
            return (int) errors.stream().map(RowError::row).distinct().count();
        }
    }

    static final int MAX_VALUE = 100;

    private final ProductService products;
    private final Validator validator;

    ProductImport(ProductService products, Validator validator) {
        this.products = products;
        this.validator = validator;
    }

    /** @throws Refused TEMPLATE_UNKNOWN, TOO_MANY_ROWS or UNREADABLE */
    Result run(UUID companyId, byte[] file) {
        List<Map<ProductColumn, String>> rows = new ArrayList<>();
        List<Integer> rowNumbers = new ArrayList<>();
        read(file, rows, rowNumbers);
        List<RowError> errors = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        int created = 0;
        for (int i = 0; i < rows.size(); i++) {
            if (importRow(companyId, rowNumbers.get(i), rows.get(i), seen, errors)) {
                created++;
            }
        }
        return new Result(rows.size(), created, errors);
    }

    private static void read(byte[] file, List<Map<ProductColumn, String>> rows, List<Integer> rowNumbers) {
        try (ReadableWorkbook workbook = new ReadableWorkbook(new ByteArrayInputStream(file))) {
            Sheet marker = workbook.findSheet(ProductTemplate.MARKER_SHEET).orElseThrow(() -> new Refused("TEMPLATE_UNKNOWN"));
            String mark;
            try (Stream<Row> markerRows = marker.openStream()) {
                mark = markerRows.findFirst().map(r -> r.getCellText(0)).orElse("");
            }
            if (!ProductTemplate.MARKER.equals(mark.strip())) {
                throw new Refused("TEMPLATE_UNKNOWN");
            }
            try (Stream<Row> stream = workbook.getFirstSheet().openStream()) {
                stream.filter(r -> r.getRowNum() > 1).forEach(r -> {
                    Map<ProductColumn, String> cells = new LinkedHashMap<>();
                    for (ProductColumn column : ProductColumn.values()) {
                        String value = text(r, column.index());
                        if (value != null) {
                            cells.put(column, value);
                        }
                    }
                    if (!cells.isEmpty()) {
                        if (rows.size() == ProductTemplate.MAX_ROWS) {
                            throw new Refused("TOO_MANY_ROWS");
                        }
                        rows.add(cells);
                        rowNumbers.add(r.getRowNum());
                    }
                });
            }
        } catch (Refused e) {
            throw e;
        } catch (IOException | RuntimeException e) {
            throw new Refused("UNREADABLE");
        }
    }

    /** The cell as text: a number without its trailing zeros (a GTIN typed as a number keeps its digits). */
    private static @Nullable String text(Row row, int index) {
        if (!row.hasCell(index)) {
            return null;
        }
        Cell cell = row.getCell(index);
        if (cell == null || cell.getType() == null) {
            return null;
        }
        String value = switch (cell.getType()) {
            case NUMBER -> cell.asNumber() == null ? null : plain(cell.asNumber());
            case STRING, FORMULA, BOOLEAN -> cell.getRawValue();
            default -> null;
        };
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static String plain(BigDecimal number) {
        BigDecimal stripped = number.stripTrailingZeros();
        return (stripped.scale() < 0 ? stripped.setScale(0) : stripped).toPlainString();
    }

    private boolean importRow(UUID companyId, int row, Map<ProductColumn, String> cells, Set<String> seen,
            List<RowError> errors) {
        List<RowError> found = new ArrayList<>();
        String gtin = cells.get(ProductColumn.GTIN) == null ? null : cells.get(ProductColumn.GTIN).replaceAll("\\s", "");
        ProductCategory category = null;
        String categoryCell = cells.get(ProductColumn.CATEGORY);
        if (categoryCell != null) {
            category = ImportTexts.categoryOf(categoryCell);
            if (category == null) {
                found.add(error(row, ProductColumn.CATEGORY.key(), "UnknownValue", categoryCell));
            }
        }
        // Fibre lines in column order; the list index of each kept line points back at its columns.
        List<FiberShare> fibers = new ArrayList<>();
        List<ProductColumn> fiberColumns = new ArrayList<>();
        boolean fibersBroken = false;
        for (ProductColumn fiberColumn : ProductColumn.FIBER_COLUMNS) {
            String fiberCell = cells.get(fiberColumn);
            String percentCell = cells.get(fiberColumn.percent());
            if (fiberCell == null && percentCell == null) {
                continue;
            }
            Fiber fiber = fiberCell == null ? null : ImportTexts.fiberOf(fiberCell);
            if (fiberCell == null) {
                found.add(error(row, fiberColumn.key(), "NotNull", null));
                fibersBroken = true;
            } else if (fiber == null) {
                found.add(error(row, fiberColumn.key(), "UnknownValue", fiberCell));
                fibersBroken = true;
            }
            Integer percent = null;
            if (percentCell != null) {
                percent = percent(percentCell);
                if (percent == null) {
                    found.add(error(row, fiberColumn.percent().key(), "Integer", percentCell));
                    fibersBroken = true;
                }
            }
            fibers.add(new FiberShare(fiber, percent));
            fiberColumns.add(fiberColumn);
        }
        ProductCreateRequest request = new ProductCreateRequest(gtin == null ? null : gtin, cells.get(ProductColumn.SKU),
                cells.get(ProductColumn.NAME), category, cells.get(ProductColumn.DESCRIPTION),
                fibers.isEmpty() || fibersBroken ? null : fibers, null);
        for (ConstraintViolation<ProductCreateRequest> violation : validator.validate(request)) {
            String column = column(violation.getPropertyPath().toString(), fiberColumns);
            String code = violation.getConstraintDescriptor().getAnnotation().annotationType().getSimpleName();
            boolean alreadyNamed = found.stream().anyMatch(e -> e.column().equals(column));
            if (column != null && !alreadyNamed) {
                found.add(error(row, column, code, valueOf(column, cells)));
            }
        }
        if (found.isEmpty()) {
            String normalized = Gtin.normalize(gtin);
            if (!seen.add(normalized)) {
                found.add(error(row, ProductColumn.GTIN.key(), "Duplicate", gtin));
            } else {
                try {
                    products.create(companyId, request);
                    return true;
                } catch (ConflictException e) {
                    found.add(error(row, ProductColumn.GTIN.key(), "Unique", gtin));
                }
            }
        }
        errors.addAll(found);
        return false;
    }

    /** "95", "95 %", "%95" → 95; "95,5", "abc" → null (an Integer error, as the API says for 95.5). */
    static @Nullable Integer percent(String cell) {
        String digits = cell.replace("%", "").strip();
        if (!digits.matches("\\d{1,3}")) {
            return null;
        }
        return Integer.valueOf(digits);
    }

    /** The column a constraint's property path points at. */
    private static @Nullable String column(String path, List<ProductColumn> fiberColumns) {
        switch (path) {
            case "gtin": return ProductColumn.GTIN.key();
            case "sku": return ProductColumn.SKU.key();
            case "name": return ProductColumn.NAME.key();
            case "category": return ProductColumn.CATEGORY.key();
            case "description": return ProductColumn.DESCRIPTION.key();
            case "declaredFiberComposition": return ProductColumn.FIBERS;
            default:
                java.util.regex.Matcher m = java.util.regex.Pattern
                        .compile("declaredFiberComposition\\[(\\d+)]\\.(fiber|percent)").matcher(path);
                if (m.matches() && Integer.parseInt(m.group(1)) < fiberColumns.size()) {
                    ProductColumn fiber = fiberColumns.get(Integer.parseInt(m.group(1)));
                    return m.group(2).equals("fiber") ? fiber.key() : fiber.percent().key();
                }
                return null;
        }
    }

    private static @Nullable String valueOf(String column, Map<ProductColumn, String> cells) {
        for (ProductColumn c : ProductColumn.values()) {
            if (c.key().equals(column)) {
                return cells.get(c);
            }
        }
        return null;
    }

    private static RowError error(int row, String column, String code, @Nullable String value) {
        return new RowError(row, column, code,
                value == null ? null : value.length() > MAX_VALUE ? value.substring(0, MAX_VALUE) + "…" : value);
    }
}
