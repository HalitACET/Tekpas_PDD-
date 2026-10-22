-- M12 T3: inviting a colleague (docs/m12-plan.md §5). The user exists from the invitation on, inactive and with an
-- unusable password, until the link is used to set one. The link's token is stored only as its SHA-256, as the
-- supplier links (K21); renewing a link replaces the row.
CREATE TABLE user_invitation (
    id         UUID PRIMARY KEY,
    company_id UUID        NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash CHAR(64)    NOT NULL UNIQUE,
    invited_by UUID        REFERENCES app_user(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_invitation_user ON user_invitation (user_id);
