BEGIN;

CREATE INDEX IF NOT EXISTS idx_users_username_active
    ON public.users (username, is_active);

CREATE INDEX IF NOT EXISTS idx_payments_payment_date
    ON public.payments (payment_date DESC, payment_id DESC);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment
    ON public.payment_allocations (payment_id, assessment_id);

CREATE INDEX IF NOT EXISTS idx_taxpayer_year_records_taxpayer_year
    ON public.taxpayer_year_records (taxpayer_id, tax_year, is_included);

COMMIT;
