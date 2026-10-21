package com.tekpas.document;

import com.tekpas.common.error.FieldViolation;
import com.tekpas.common.error.InvalidFieldsException;
import org.springframework.http.HttpStatus;

/**
 * A file the server refuses at upload (design v0.5 53a). Same shape as a field error on {@code file}; the code
 * picks the translated message: FileTooLarge (413), FileType (415), FileEmpty, FileEncrypted, FileCorrupt,
 * FilePages, FileDimensions (400). Nothing is stored for a rejected file.
 */
public class UploadRejectedException extends InvalidFieldsException {

    private final HttpStatus status;
    private final String code;
    private final String message;

    private UploadRejectedException(HttpStatus status, String code, String message) {
        this(status, code, message, "file");
    }

    private UploadRejectedException(HttpStatus status, String code, String message, String field) {
        super(status, new FieldViolation(field, code, message));
        this.status = status;
        this.code = code;
        this.message = message;
    }

    /** The same refusal for one page of a photo upload: field {@code pages[index]} (M8). */
    UploadRejectedException onPage(int index) {
        return new UploadRejectedException(status, code, message, "pages[" + index + "]");
    }

    /** A photo upload with no page or more than {@code max} (field pages, code PageCount). */
    static UploadRejectedException pageCount(int max) {
        return new UploadRejectedException(HttpStatus.BAD_REQUEST, "PageCount",
                "Between 1 and " + max + " pages are accepted", "pages");
    }

    /** The photos together are larger than one document may be (field pages, code FileTooLarge). */
    static UploadRejectedException pagesTooLarge() {
        return new UploadRejectedException(HttpStatus.CONTENT_TOO_LARGE, "FileTooLarge",
                "The pages together are larger than 10 MB", "pages");
    }

    public static UploadRejectedException tooLarge() {
        return new UploadRejectedException(HttpStatus.CONTENT_TOO_LARGE, "FileTooLarge",
                "The file is larger than 10 MB");
    }

    static UploadRejectedException unsupportedType() {
        return new UploadRejectedException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "FileType",
                "Only PDF, JPG and PNG files are accepted");
    }

    static UploadRejectedException empty() {
        return new UploadRejectedException(HttpStatus.BAD_REQUEST, "FileEmpty", "The file is empty");
    }

    static UploadRejectedException encrypted() {
        return new UploadRejectedException(HttpStatus.BAD_REQUEST, "FileEncrypted",
                "Password-protected PDFs are not accepted");
    }

    static UploadRejectedException corrupt() {
        return new UploadRejectedException(HttpStatus.BAD_REQUEST, "FileCorrupt", "The file could not be read");
    }

    static UploadRejectedException tooManyPages(int max) {
        return new UploadRejectedException(HttpStatus.BAD_REQUEST, "FilePages",
                "The PDF has more than " + max + " pages");
    }

    static UploadRejectedException tooManyPixels() {
        return new UploadRejectedException(HttpStatus.BAD_REQUEST, "FileDimensions", "The image is too large");
    }
}
