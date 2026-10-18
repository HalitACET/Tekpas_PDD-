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

    private UploadRejectedException(HttpStatus status, String code, String message) {
        super(status, new FieldViolation("file", code, message));
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
