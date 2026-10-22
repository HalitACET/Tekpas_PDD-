package com.tekpas.importer;

import com.tekpas.product.Fiber;
import com.tekpas.product.ProductCategory;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import org.dhatim.fastexcel.Range;
import org.dhatim.fastexcel.VisibilityState;
import org.dhatim.fastexcel.Workbook;
import org.dhatim.fastexcel.Worksheet;

/**
 * The product template, version 1 (docs/m11-plan.md §4): the first sheet has the headers in the language asked for and
 * room for {@link #MAX_ROWS} products; category and fibre cells pick from lists on a hidden sheet; GTIN cells are text,
 * so Excel keeps a leading zero. A very hidden sheet carries {@link #MARKER}, which the reader requires.
 */
final class ProductTemplate {

    static final String MARKER = "kozapass:products:1";
    static final String MARKER_SHEET = "kozapass";
    static final int MAX_ROWS = 1000;

    private ProductTemplate() {
    }

    static byte[] write(String language) {
        ImportTexts texts = ImportTexts.of(language);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            Workbook workbook = new Workbook(out, "KozaPass", "1.0");
            Worksheet products = workbook.newWorksheet(texts.text("sheet.products"));
            Worksheet lists = workbook.newWorksheet(texts.text("sheet.lists"));
            Worksheet marker = workbook.newWorksheet(MARKER_SHEET);

            ProductCategory[] categories = ProductCategory.values();
            for (int i = 0; i < categories.length; i++) {
                lists.value(i, 0, texts.category(categories[i]));
            }
            Fiber[] fibers = Fiber.values();
            for (int i = 0; i < fibers.length; i++) {
                lists.value(i, 1, texts.fiber(fibers[i]));
            }
            lists.setVisibilityState(VisibilityState.HIDDEN);
            marker.value(0, 0, MARKER);
            marker.setVisibilityState(VisibilityState.VERY_HIDDEN);

            for (ProductColumn column : ProductColumn.values()) {
                products.value(0, column.index(), header(texts, column));
                products.style(0, column.index()).bold().fillColor("EFE6D8").set();
            }
            products.width(ProductColumn.GTIN.index(), 18);
            products.width(ProductColumn.SKU.index(), 14);
            products.width(ProductColumn.NAME.index(), 32);
            products.width(ProductColumn.CATEGORY.index(), 18);
            products.width(ProductColumn.DESCRIPTION.index(), 40);
            for (ProductColumn fiber : ProductColumn.FIBER_COLUMNS) {
                products.width(fiber.index(), 22);
                products.width(fiber.percent().index(), 7);
            }
            products.freezePane(0, 1);
            products.range(1, ProductColumn.GTIN.index(), MAX_ROWS, ProductColumn.GTIN.index()).style().format("@").set();
            list(products, ProductColumn.CATEGORY, lists.range(0, 0, categories.length - 1, 0), texts,
                    "validation.category");
            for (ProductColumn fiber : ProductColumn.FIBER_COLUMNS) {
                list(products, fiber, lists.range(0, 1, fibers.length - 1, 1), texts, "validation.fiber");
            }
            workbook.finish();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toByteArray();
    }

    static String header(ImportTexts texts, ProductColumn column) {
        return switch (column) {
            case GTIN -> texts.text("column.gtin");
            case SKU -> texts.text("column.sku");
            case NAME -> texts.text("column.name");
            case CATEGORY -> texts.text("column.category");
            case DESCRIPTION -> texts.text("column.description");
            case FIBER_1, FIBER_2, FIBER_3 -> texts.text("column.fiber", ProductColumn.FIBER_COLUMNS.indexOf(column) + 1);
            case PERCENT_1, PERCENT_2, PERCENT_3 -> texts.text("column.percent",
                    ProductColumn.FIBER_COLUMNS.indexOf(ProductColumn.values()[column.ordinal() - 1]) + 1);
        };
    }

    private static void list(Worksheet sheet, ProductColumn column, Range values, ImportTexts texts, String errorKey) {
        sheet.range(1, column.index(), MAX_ROWS, column.index()).validateWithList(values).allowBlank(true)
                .showErrorMessage(true).errorTitle(texts.text("validation.title")).error(texts.text(errorKey));
    }
}
