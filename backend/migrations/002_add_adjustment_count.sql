BEGIN;

ALTER TABLE public.tax_assessments
ADD COLUMN IF NOT EXISTS adjustment_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_tax_assessments_adjustment_count'
    ) THEN
        ALTER TABLE public.tax_assessments
        ADD CONSTRAINT chk_tax_assessments_adjustment_count
        CHECK (adjustment_count >= 0);
    END IF;
END $$;

COMMIT;
