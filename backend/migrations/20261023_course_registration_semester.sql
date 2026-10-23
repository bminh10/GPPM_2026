BEGIN;

ALTER TABLE dang_ky_mon_hoc
    ADD COLUMN IF NOT EXISTS hoc_ky_id INTEGER;

ALTER TABLE dang_ky_mon_hoc
    ALTER COLUMN hoc_ky_id DROP DEFAULT,
    ALTER COLUMN hoc_ky_id DROP NOT NULL;

UPDATE dang_ky_mon_hoc
SET hoc_ky_id = NULL
WHERE hoc_ky_id = 0;

ALTER TABLE dang_ky_mon_hoc
    DROP CONSTRAINT IF EXISTS dang_ky_mon_hoc_lop_mon_unique;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'dang_ky_mon_hoc_hoc_ky_id_fkey'
          AND conrelid = 'dang_ky_mon_hoc'::regclass
    ) THEN
        ALTER TABLE dang_ky_mon_hoc
            ADD CONSTRAINT dang_ky_mon_hoc_hoc_ky_id_fkey
            FOREIGN KEY (hoc_ky_id) REFERENCES hoc_ky(id);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'dang_ky_mon_hoc_lop_mon_hoc_ky_unique'
          AND conrelid = 'dang_ky_mon_hoc'::regclass
    ) THEN
        ALTER TABLE dang_ky_mon_hoc
            ADD CONSTRAINT dang_ky_mon_hoc_lop_mon_hoc_ky_unique
            UNIQUE (lop_id, mon_id, hoc_ky_id);
    END IF;
END
$$;

COMMIT;
