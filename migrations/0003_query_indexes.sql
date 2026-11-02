CREATE INDEX monitors_schedulable ON monitors(next_check,claim_until) WHERE status!='paused';
CREATE INDEX session_expiry ON session(expires_at);
CREATE INDEX verification_expiry ON verification(expires_at);
CREATE INDEX invitation_expiry ON invitations(expires_at);
CREATE INDEX rate_limit_expiry ON rate_limits(reset_at);
CREATE INDEX auth_rate_limit_expiry ON auth_rate_limit(last_request);
CREATE INDEX deliveries_expired_lease ON notification_deliveries(lease_until) WHERE status='pending' AND attempts>=4;
