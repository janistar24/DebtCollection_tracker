BEGIN;

CREATE INDEX IF NOT EXISTS idx_taxpayers_group_active
    ON public.taxpayers (group_code, is_active);

CREATE INDEX IF NOT EXISTS idx_taxpayers_owner_code_normalized
    ON public.taxpayers ((regexp_replace(COALESCE(owner_code, ''), '\s', '', 'g')));

CREATE INDEX IF NOT EXISTS idx_taxpayer_year_records_year_included
    ON public.taxpayer_year_records (tax_year, is_included, taxpayer_id);

CREATE INDEX IF NOT EXISTS idx_tax_assessments_year_record_type
    ON public.tax_assessments (year_record_id, tax_type);

CREATE INDEX IF NOT EXISTS idx_follow_up_logs_year_record_contacted
    ON public.follow_up_logs (year_record_id, contacted_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_up_logs_recorded_by_contacted
    ON public.follow_up_logs (recorded_by, contacted_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_paid_at_status
    ON public.payments (paid_at DESC, status);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_assessment
    ON public.payment_allocations (assessment_id, payment_id);

CREATE INDEX IF NOT EXISTS idx_responsibility_assignments_active_group
    ON public.responsibility_assignments (group_code, is_active, user_id);

COMMIT;
