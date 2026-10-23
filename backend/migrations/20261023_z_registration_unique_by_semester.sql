-- Run after 20261023_course_registration_semester.sql.
BEGIN;

DO $$
DECLARE
    legacy_constraint RECORD;
BEGIN
    FOR legacy_constraint IN
        SELECT constraint_row.conname
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'dang_ky_mon_hoc'::regclass
          AND constraint_row.contype = 'u'
          AND (
              SELECT array_agg(attribute_row.attname::text ORDER BY attribute_row.attname)
              FROM unnest(constraint_row.conkey) AS key_column(attnum)
              JOIN pg_attribute AS attribute_row
                ON attribute_row.attrelid = constraint_row.conrelid
               AND attribute_row.attnum = key_column.attnum
          ) = ARRAY['lop_id', 'mon_id']::text[]
    LOOP
        EXECUTE format(
            'ALTER TABLE dang_ky_mon_hoc DROP CONSTRAINT %I',
            legacy_constraint.conname
        );
    END LOOP;
END
$$;

DO $$
DECLARE
    legacy_index RECORD;
BEGIN
    FOR legacy_index IN
        SELECT index_row.indexrelid::regclass AS index_name
        FROM pg_index AS index_row
        WHERE index_row.indrelid = 'dang_ky_mon_hoc'::regclass
          AND index_row.indisunique
          AND NOT index_row.indisprimary
          AND index_row.indnkeyatts = 2
          AND NOT EXISTS (
              SELECT 1
              FROM pg_constraint AS constraint_row
              WHERE constraint_row.conindid = index_row.indexrelid
          )
          AND (
              SELECT array_agg(attribute_row.attname::text ORDER BY attribute_row.attname)
              FROM unnest(index_row.indkey) WITH ORDINALITY AS key_column(attnum, ordinal)
              JOIN pg_attribute AS attribute_row
                ON attribute_row.attrelid = index_row.indrelid
               AND attribute_row.attnum = key_column.attnum
              WHERE key_column.ordinal <= index_row.indnkeyatts
          ) = ARRAY['lop_id', 'mon_id']::text[]
    LOOP
        EXECUTE format('DROP INDEX %s', legacy_index.index_name);
    END LOOP;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conrelid = 'dang_ky_mon_hoc'::regclass
          AND constraint_row.contype = 'u'
          AND (
              SELECT array_agg(attribute_row.attname::text ORDER BY attribute_row.attname)
              FROM unnest(constraint_row.conkey) AS key_column(attnum)
              JOIN pg_attribute AS attribute_row
                ON attribute_row.attrelid = constraint_row.conrelid
               AND attribute_row.attnum = key_column.attnum
          ) = ARRAY['hoc_ky_id', 'lop_id', 'mon_id']::text[]
    ) THEN
        ALTER TABLE dang_ky_mon_hoc
            ADD CONSTRAINT dang_ky_mon_hoc_lop_mon_hoc_ky_unique
            UNIQUE (lop_id, mon_id, hoc_ky_id);
    END IF;
END
$$;

COMMIT;
