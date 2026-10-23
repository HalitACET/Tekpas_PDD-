-- M12 T6 (design v1.2 160): "Pasif · 9 Eki 2026'dan beri". When a user was deactivated; cleared when reactivated.
-- Users deactivated before this have none.
ALTER TABLE app_user ADD COLUMN deactivated_at TIMESTAMPTZ;
