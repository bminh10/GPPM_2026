BEGIN;

ALTER TABLE dang_ky_mon_hoc
    DROP CONSTRAINT IF EXISTS dang_ky_mon_hoc_lop_mon_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'dang_ky_mon_hoc'::regclass
          AND conname = 'dang_ky_mon_hoc_lop_mon_hoc_ky_unique'
    ) THEN
        ALTER TABLE dang_ky_mon_hoc
            ADD CONSTRAINT dang_ky_mon_hoc_lop_mon_hoc_ky_unique
            UNIQUE (lop_id, mon_id, hoc_ky_id);
    END IF;
END
$$;

COMMIT;
