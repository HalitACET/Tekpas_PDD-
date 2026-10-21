package com.tekpas.notification;

import com.tekpas.jobs.JobContext;
import com.tekpas.jobs.JobFailedPermanently;
import com.tekpas.jobs.JobHandler;
import com.tekpas.jobs.JobType;
import com.tekpas.validation.ConsistencyRules;
import java.text.MessageFormat;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.ResourceBundle;
import java.util.UUID;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * {@code PUSH_NOTIFY} (docs/m9-plan.md §4.3): the phones of the company's OWNER and ADMIN users, each in the user's
 * language ({@code i18n/push*.properties}, CLAUDE.md rule 8). The lock screen shows the batch number, the step and
 * the supplier, nothing from a document. A phone Expo no longer knows loses its token. Runs again after a crash: the
 * worst case is a notification twice, never one to the wrong company.
 */
@Component
class PushNotifyJob implements JobHandler<PushNotifyJob.Payload> {

    private static final Logger log = LoggerFactory.getLogger(PushNotifyJob.class);
    private static final ResourceBundle.Control TEXTS =
            ResourceBundle.Control.getNoFallbackControl(ResourceBundle.Control.FORMAT_PROPERTIES);

    /**
     * @param companyId CERTS_EXPIRING; STEP_SUBMITTED finds it through the step's batch
     * @param stepId STEP_SUBMITTED
     * @param count CERTS_EXPIRING: certificates that entered the warning days
     */
    record Payload(PushKind kind, @Nullable UUID companyId, @Nullable UUID stepId, int count) {

        static Payload stepSubmitted(UUID stepId) {
            return new Payload(PushKind.STEP_SUBMITTED, null, stepId, 0);
        }

        static Payload certificatesExpiring(UUID companyId, int count) {
            return new Payload(PushKind.CERTS_EXPIRING, companyId, null, count);
        }
    }

    private record Recipient(String token, String locale) {
    }

    private record Submission(UUID companyId, UUID batchId, String stepType, String batchNo, @Nullable String supplier) {
    }

    private final JdbcTemplate jdbc;
    private final ExpoPushClient expo;

    PushNotifyJob(JdbcTemplate jdbc, ExpoPushClient expo) {
        this.jdbc = jdbc;
        this.expo = expo;
    }

    @Override
    public JobType type() {
        return JobType.PUSH_NOTIFY;
    }

    @Override
    public Class<Payload> payloadType() {
        return Payload.class;
    }

    @Override
    public Duration timeout() {
        return Duration.ofMinutes(2);
    }

    @Override
    public void handle(Payload payload, JobContext context) {
        switch (payload.kind()) {
            case STEP_SUBMITTED -> stepSubmitted(payload);
            case CERTS_EXPIRING -> certificatesExpiring(payload);
        }
    }

    private void stepSubmitted(Payload payload) {
        if (payload.stepId() == null) {
            throw new JobFailedPermanently("STEP_SUBMITTED without a step");
        }
        List<Submission> found = jdbc.query("""
                SELECT b.company_id, b.id, s.step_type, b.batch_no, c.name
                FROM supply_step s JOIN batch b ON b.id = s.batch_id
                LEFT JOIN company c ON c.id = s.supplier_company_id
                WHERE s.id = ? AND s.status = 'SUBMITTED'""",
                (rs, n) -> new Submission(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class), rs.getString(3),
                        rs.getString(4), rs.getString(5)), payload.stepId());
        if (found.isEmpty()) {
            // Reviewed (or removed) before the job ran: nothing is waiting any more.
            return;
        }
        Submission s = found.getFirst();
        // The app's review screen reads the step from its batch's chain.
        String url = "/step/" + payload.stepId() + "?batch=" + s.batchId();
        send(s.companyId(), locale -> {
            ResourceBundle texts = texts(locale);
            String step = texts.getString("step." + s.stepType());
            String body = s.supplier() == null
                    ? format(texts, locale, "stepSubmitted.bodyNoSupplier", s.batchNo())
                    : format(texts, locale, "stepSubmitted.body", s.supplier(), s.batchNo());
            return new Text(format(texts, locale, "stepSubmitted.title", step), body, url);
        });
    }

    private void certificatesExpiring(Payload payload) {
        if (payload.companyId() == null || payload.count() <= 0) {
            throw new JobFailedPermanently("CERTS_EXPIRING without a company or a count");
        }
        send(payload.companyId(), locale -> {
            ResourceBundle texts = texts(locale);
            return new Text(texts.getString("certsExpiring.title"),
                    format(texts, locale, "certsExpiring.body", payload.count(), ConsistencyRules.EXPIRING_DAYS), "/");
        });
    }

    private record Text(String title, String body, String url) {
    }

    private interface Writer {
        Text write(String locale);
    }

    private void send(UUID companyId, Writer writer) {
        List<Recipient> recipients = jdbc.query("""
                SELECT t.expo_token, u.locale
                FROM push_token t JOIN app_user u ON u.id = t.user_id
                WHERE u.company_id = ? AND u.active AND u.role IN ('OWNER', 'ADMIN')
                ORDER BY t.created_at""",
                (rs, n) -> new Recipient(rs.getString(1), rs.getString(2)), companyId);
        List<PushMessage> messages = new ArrayList<>(recipients.size());
        for (Recipient r : recipients) {
            Text text = writer.write(r.locale());
            messages.add(PushMessage.of(r.token(), text.title(), text.body(), text.url()));
        }
        int gone = 0;
        for (int from = 0; from < messages.size(); from += ExpoPushClient.MAX_BATCH) {
            List<PushMessage> batch = messages.subList(from, Math.min(from + ExpoPushClient.MAX_BATCH, messages.size()));
            List<PushTicket> tickets = sendOrFail(batch);
            for (int i = 0; i < tickets.size(); i++) {
                if (tickets.get(i).deviceGone()) {
                    gone += jdbc.update("DELETE FROM push_token WHERE expo_token = ?", batch.get(i).to());
                }
            }
        }
        log.info("Push: {} message(s) for company {}, {} token(s) removed", messages.size(), companyId, gone);
    }

    private List<PushTicket> sendOrFail(List<PushMessage> batch) {
        try {
            return expo.send(batch);
        } catch (IllegalStateException e) {
            throw new JobFailedPermanently(e.getMessage());
        }
    }

    /** tr is the base file; en and de beside it. An unknown language gets Turkish. */
    static ResourceBundle texts(String locale) {
        return ResourceBundle.getBundle("i18n/push", Locale.forLanguageTag(locale), TEXTS);
    }

    private static String format(ResourceBundle texts, String locale, String key, Object... arguments) {
        return new MessageFormat(texts.getString(key), Locale.forLanguageTag(locale)).format(arguments);
    }
}
