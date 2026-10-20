package com.tekpas.validation;

import com.tekpas.batch.BatchStatus;
import com.tekpas.document.DocType;
import com.tekpas.supplychain.StepType;
import com.tekpas.validation.dto.ExpiringCertificate;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The company's confirmed certificates that end within some days or already ended, closest end first. A certificate
 * that a newer confirmed one of the same type in the same step replaced is not listed (a renewal ends the task).
 */
@Service
public class ExpiringCertificates {

    private final JdbcTemplate jdbc;
    private final Clock clock;

    ExpiringCertificates(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ExpiringCertificate> within(UUID companyId, int days) {
        LocalDate today = LocalDate.ofInstant(clock.instant(), ValidationService.ZONE);
        return jdbc.query("""
                SELECT d.id, d.doc_type, d.valid_until, d.holder_name, s.id AS step_id, s.step_type,
                       s.supplier_company_id, c.name AS supplier_name, b.id AS batch_id, b.batch_no, b.status
                FROM document d
                JOIN supply_step s ON s.id = d.step_id
                JOIN batch b ON b.id = s.batch_id
                LEFT JOIN company c ON c.id = s.supplier_company_id
                WHERE d.company_id = ? AND b.company_id = ? AND d.review_status = 'VERIFIED'
                  AND d.valid_until IS NOT NULL AND d.valid_until <= ? AND d.doc_type IN (%s)
                  AND NOT EXISTS (
                      SELECT 1 FROM document n
                      WHERE n.step_id = d.step_id AND n.doc_type = d.doc_type AND n.review_status = 'VERIFIED'
                        AND (n.valid_until > d.valid_until OR (n.valid_until = d.valid_until AND n.id < d.id)))
                ORDER BY d.valid_until, b.batch_no, d.id
                """.formatted(CertificateExpiryScanJob.certificateTypes()), (rs, n) -> {
                    LocalDate until = rs.getObject("valid_until", LocalDate.class);
                    return new ExpiringCertificate(rs.getObject("id", UUID.class),
                            DocType.valueOf(rs.getString("doc_type")), until,
                            (int) ChronoUnit.DAYS.between(today, until), rs.getString("holder_name"),
                            rs.getObject("step_id", UUID.class), StepType.valueOf(rs.getString("step_type")),
                            rs.getObject("supplier_company_id", UUID.class), rs.getString("supplier_name"),
                            rs.getObject("batch_id", UUID.class), rs.getString("batch_no"),
                            BatchStatus.valueOf(rs.getString("status")));
                }, companyId, companyId, Date.valueOf(today.plusDays(days)));
    }
}
