-- M12 T4: the audit trail page lists a company's entries newest first (docs/m12-plan.md §6).
CREATE INDEX idx_audit_log_company ON audit_log (company_id, id DESC);
