package com.tekpas.document.reading;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.io.IOUtils;
import org.apache.pdfbox.io.RandomAccessReadBuffer;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

/**
 * The text layer of a PDF, page by page. Only text is extracted: nothing is rendered, run or decoded beyond the
 * page content (no images, scripts, forms or embedded files). PDFBox keeps its buffers in temporary files rather
 * than the heap (the Render instance has 512 MB).
 */
final class PdfText {

    /** Pages read at most; the upload already refuses longer PDFs. */
    static final int MAX_PAGES = 20;

    private PdfText() {
    }

    static List<String> pages(byte[] pdf) throws IOException {
        try (PDDocument doc = Loader.loadPDF(new RandomAccessReadBuffer(pdf), "", null, null,
                IOUtils.createTempFileOnlyStreamCache())) {
            int count = Math.min(doc.getNumberOfPages(), MAX_PAGES);
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            List<String> pages = new ArrayList<>(count);
            for (int page = 1; page <= count; page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                pages.add(stripper.getText(doc));
            }
            return pages;
        }
    }
}
