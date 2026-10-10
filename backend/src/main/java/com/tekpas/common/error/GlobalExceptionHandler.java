package com.tekpas.common.error;

import jakarta.validation.ConstraintViolation;
import com.tekpas.common.web.RequestId;
import com.tekpas.request.LinkClosedException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URI;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.hibernate.validator.engine.HibernateConstraintViolation;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.exc.InvalidFormatException;

/** Every error leaves the API as an RFC 7807 ProblemDetail. */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ProblemDetail handleApiException(ApiException ex) {
        ProblemDetail body = problem(ex.status(), ex.type(), ex.title(), ex.getMessage());
        if (ex instanceof ConflictException conflict) {
            if (!conflict.errors().isEmpty()) {
                body.setProperty("errors", conflict.errors());
            }
            if (conflict.reason() != null) {
                body.setProperty("reason", conflict.reason());
            }
        } else if (ex instanceof InvalidFieldsException invalid) {
            body.setProperty("errors", sorted(invalid.errors()));
        } else if (ex instanceof LinkClosedException closed) {
            body.setProperty("reason", closed.reason());
            if (closed.link() != null) {
                body.setProperty("link", closed.link());
            }
        }
        return body;
    }

    /** 429 with Retry-After (seconds), from the rate limits of the public link endpoints. */
    @ExceptionHandler(TooManyRequestsException.class)
    ResponseEntity<ProblemDetail> handleTooManyRequests(TooManyRequestsException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.retryAfterSeconds()))
                .body(handleApiException(ex));
    }

    // Method security failures surface in MVC, not in the security filter chain.
    @ExceptionHandler(AccessDeniedException.class)
    ProblemDetail handleAccessDenied(AccessDeniedException ex) {
        return problem(HttpStatus.FORBIDDEN, ProblemTypes.FORBIDDEN, "Forbidden",
                "You do not have permission to perform this action");
    }

    @ExceptionHandler(AuthenticationException.class)
    ProblemDetail handleAuthentication(AuthenticationException ex) {
        return problem(HttpStatus.UNAUTHORIZED, ProblemTypes.UNAUTHORIZED, "Unauthorized",
                "Authentication is required");
    }

    @ExceptionHandler(Exception.class)
    ProblemDetail handleUnexpected(Exception ex) {
        log.error("Unhandled exception", ex);
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, ProblemTypes.INTERNAL, "Internal server error",
                "An unexpected error occurred");
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> new FieldViolation(e.getField(), String.valueOf(e.getCode()), e.getDefaultMessage(),
                        params(e)))
                .toList();
        return handleExceptionInternal(ex, validationProblem(errors), headers, HttpStatus.BAD_REQUEST, request);
    }

    /** Invalid query or path parameters (e.g. size=500): same shape as body validation, field = parameter name. */
    @Override
    protected ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<FieldViolation> errors = ex.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> new FieldViolation(String.valueOf(result.getMethodParameter().getParameterName()),
                                code(error), error.getDefaultMessage())))
                .toList();
        return handleExceptionInternal(ex, validationProblem(errors), headers, HttpStatus.BAD_REQUEST, request);
    }

    /**
     * A fraction for an integer field (ACCEPT_FLOAT_AS_INT is off) is a field error like the constraint
     * violations, so clients can show it under the field. Any other unreadable body stays a plain 400.
     */
    @Override
    protected @Nullable ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        if (ex.getCause() instanceof InvalidFormatException invalid && isFractionForInteger(invalid)
                && !invalid.getPath().isEmpty()) {
            FieldViolation error = new FieldViolation(fieldPath(invalid.getPath()), "Integer",
                    "must be a whole number");
            return handleExceptionInternal(ex, validationProblem(List.of(error)), headers, HttpStatus.BAD_REQUEST,
                    request);
        }
        return super.handleHttpMessageNotReadable(ex, headers, status, request);
    }

    private static boolean isFractionForInteger(InvalidFormatException ex) {
        Class<?> target = ex.getTargetType();
        boolean integerTarget = target == Integer.class || target == int.class || target == Long.class
                || target == long.class || target == Short.class || target == short.class
                || target == BigInteger.class;
        return integerTarget && (ex.getValue() instanceof Double || ex.getValue() instanceof Float
                || ex.getValue() instanceof BigDecimal);
    }

    /** Same notation as bean validation: {@code declaredFiberComposition[0].percent}. */
    private static String fieldPath(List<JacksonException.Reference> path) {
        StringBuilder field = new StringBuilder();
        for (JacksonException.Reference ref : path) {
            if (ref.getPropertyName() != null) {
                if (!field.isEmpty()) {
                    field.append('.');
                }
                field.append(ref.getPropertyName());
            } else if (ref.getIndex() >= 0) {
                field.append('[').append(ref.getIndex()).append(']');
            }
        }
        return field.toString();
    }

    private static ProblemDetail validationProblem(List<FieldViolation> errors) {
        ProblemDetail body = problem(HttpStatus.BAD_REQUEST, ProblemTypes.VALIDATION, "Validation failed",
                "One or more fields are invalid");
        body.setProperty("errors", sorted(errors));
        return body;
    }

    private static List<FieldViolation> sorted(List<FieldViolation> errors) {
        return errors.stream()
                .sorted(Comparator.comparing(FieldViolation::field).thenComparing(FieldViolation::code))
                .toList();
    }

    /** The constraint name (last code, e.g. "Max"), like FieldError#getCode for body fields. */
    private static String code(MessageSourceResolvable error) {
        String[] codes = error.getCodes();
        return codes == null || codes.length == 0 ? "Invalid" : codes[codes.length - 1];
    }

    /** Values a constraint attached for the translated message (Hibernate Validator dynamic payload). */
    @SuppressWarnings("unchecked")
    private static @Nullable Map<String, Object> params(FieldError error) {
        if (!error.contains(ConstraintViolation.class)) {
            return null;
        }
        ConstraintViolation<?> violation = error.unwrap(ConstraintViolation.class);
        return violation instanceof HibernateConstraintViolation<?> hv ? hv.getDynamicPayload(Map.class) : null;
    }

    /**
     * Framework-produced problems (malformed body, unknown route, ...) get our type URIs too. Done here
     * rather than in handleExceptionInternal because the body is only filled in by then.
     */
    @Override
    protected ResponseEntity<Object> createResponseEntity(
            Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        // Spring 7 leaves the type null (older versions used about:blank).
        if (body instanceof ProblemDetail pd) {
            if (pd.getType() == null || "about:blank".equals(pd.getType().toString())) {
                if (statusCode.value() == 400) {
                    pd.setType(ProblemTypes.BAD_REQUEST);
                } else if (statusCode.value() == 404) {
                    pd.setType(ProblemTypes.NOT_FOUND);
                }
            }
            withRequestId(pd);
        }
        return super.createResponseEntity(body, headers, statusCode, request);
    }

    private static ProblemDetail problem(HttpStatus status, URI type, String title, String detail) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(status, detail);
        pd.setType(type);
        pd.setTitle(title);
        return withRequestId(pd);
    }

    /** The X-Request-Id of this response, so a reported error can be found in the log. */
    private static ProblemDetail withRequestId(ProblemDetail pd) {
        String requestId = RequestId.current();
        if (requestId != null) {
            pd.setProperty("requestId", requestId);
        }
        return pd;
    }
}
