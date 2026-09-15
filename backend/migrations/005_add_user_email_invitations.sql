BEGIN;

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email VARCHAR(254);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
ON public.users (LOWER(email))
WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.user_invitations (
    invitation_id BIGSERIAL PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    employee_code VARCHAR(100) NOT NULL,
    first_name VARCHAR(150) NOT NULL,
    last_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL,
    group_code VARCHAR(50),
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
    created_user_id BIGINT REFERENCES public.users(user_id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_invitations_role CHECK (role IN ('OFFICER', 'DIRECTOR', 'ADMIN')),
    CONSTRAINT chk_user_invitations_group CHECK (role <> 'OFFICER' OR group_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_user_invitations_email_status
ON public.user_invitations (LOWER(email), accepted_at, revoked_at, expires_at);

COMMIT;
