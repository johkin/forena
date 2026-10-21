-- ADR-014: business history identifies the account, not the login session.
-- Authentication still validates session_id from the verified token; future technical
-- audit logging can read that claim without persisting it in business tables.
ALTER TABLE forena.invitation_history DROP COLUMN session_id;
