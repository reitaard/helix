BEGIN;

-- Migrate the durable Comfy worker ID without losing its dependent lineage.
-- Preserve each existing FK's ON DELETE action while changing only ON UPDATE.
DO $$
DECLARE
    child_table_name TEXT;
    constraint_name TEXT;
    delete_action TEXT;
BEGIN
    FOR child_table_name, constraint_name, delete_action IN
        SELECT
            rel.relname,
            con.conname,
            CASE con.confdeltype
                WHEN 'a' THEN 'NO ACTION'
                WHEN 'r' THEN 'RESTRICT'
                WHEN 'c' THEN 'CASCADE'
                WHEN 'n' THEN 'SET NULL'
                WHEN 'd' THEN 'SET DEFAULT'
            END
        FROM pg_constraint AS con
        JOIN pg_class AS rel
            ON rel.oid = con.conrelid
        JOIN pg_namespace AS ns
            ON ns.oid = rel.relnamespace
        JOIN pg_class AS parent
            ON parent.oid = con.confrelid
        JOIN pg_namespace AS parent_ns
            ON parent_ns.oid = parent.relnamespace
        WHERE con.contype = 'f'
          AND ns.nspname = current_schema()
          AND parent_ns.nspname = current_schema()
          AND parent.relname = 'workers'
          AND rel.relname IN (
              'worker_observations',
              'media_jobs',
              'operator_worker_alert_state'
          )
          AND con.conkey = ARRAY[
              (
                  SELECT attnum
                  FROM pg_attribute
                  WHERE attrelid = rel.oid
                    AND attname = 'worker_id'
                    AND NOT attisdropped
              )
          ]
          AND con.confkey = ARRAY[
              (
                  SELECT attnum
                  FROM pg_attribute
                  WHERE attrelid = parent.oid
                    AND attname = 'id'
                    AND NOT attisdropped
              )
          ]
          AND con.confupdtype <> 'c'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I DROP CONSTRAINT %I',
            current_schema(),
            child_table_name,
            constraint_name
        );

        EXECUTE format(
            'ALTER TABLE %I.%I ADD CONSTRAINT %I '
            || 'FOREIGN KEY (%I) REFERENCES %I.%I (%I) '
            || 'ON DELETE %s ON UPDATE CASCADE',
            current_schema(),
            child_table_name,
            constraint_name,
            'worker_id',
            current_schema(),
            'workers',
            'id',
            delete_action
        );
    END LOOP;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS con
        JOIN pg_class AS rel
            ON rel.oid = con.conrelid
        JOIN pg_namespace AS ns
            ON ns.oid = rel.relnamespace
        JOIN pg_class AS parent
            ON parent.oid = con.confrelid
        JOIN pg_namespace AS parent_ns
            ON parent_ns.oid = parent.relnamespace
        WHERE con.contype = 'f'
          AND ns.nspname = current_schema()
          AND rel.relname = 'worker_observations'
          AND parent_ns.nspname = current_schema()
          AND parent.relname = 'workers'
          AND con.conkey = ARRAY[
              (
                  SELECT attnum
                  FROM pg_attribute
                  WHERE attrelid = rel.oid
                    AND attname = 'worker_id'
                    AND NOT attisdropped
              )
          ]
          AND con.confkey = ARRAY[
              (
                  SELECT attnum
                  FROM pg_attribute
                  WHERE attrelid = parent.oid
                    AND attname = 'id'
                    AND NOT attisdropped
              )
          ]
          AND con.confupdtype = 'c'
    ) THEN
        ALTER TABLE worker_observations
            ADD CONSTRAINT worker_observations_worker_id_fkey
            FOREIGN KEY (worker_id)
            REFERENCES workers(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS con
        JOIN pg_class AS rel
            ON rel.oid = con.conrelid
        JOIN pg_namespace AS ns
            ON ns.oid = rel.relnamespace
        JOIN pg_class AS parent
            ON parent.oid = con.confrelid
        JOIN pg_namespace AS parent_ns
            ON parent_ns.oid = parent.relnamespace
        WHERE con.contype = 'f'
          AND ns.nspname = current_schema()
          AND rel.relname = 'media_jobs'
          AND parent_ns.nspname = current_schema()
          AND parent.relname = 'workers'
          AND con.conkey = ARRAY[
              (
                  SELECT attnum
                  FROM pg_attribute
                  WHERE attrelid = rel.oid
                    AND attname = 'worker_id'
                    AND NOT attisdropped
              )
          ]
          AND con.confkey = ARRAY[
              (
                  SELECT attnum
                  FROM pg_attribute
                  WHERE attrelid = parent.oid
                    AND attname = 'id'
                    AND NOT attisdropped
              )
          ]
          AND con.confupdtype = 'c'
    ) THEN
        ALTER TABLE media_jobs
            ADD CONSTRAINT media_jobs_worker_id_fkey
            FOREIGN KEY (worker_id)
            REFERENCES workers(id)
            ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS con
        JOIN pg_class AS rel
            ON rel.oid = con.conrelid
        JOIN pg_namespace AS ns
            ON ns.oid = rel.relnamespace
        JOIN pg_class AS parent
            ON parent.oid = con.confrelid
        JOIN pg_namespace AS parent_ns
            ON parent_ns.oid = parent.relnamespace
        WHERE con.contype = 'f'
          AND ns.nspname = current_schema()
          AND rel.relname = 'operator_worker_alert_state'
          AND parent_ns.nspname = current_schema()
          AND parent.relname = 'workers'
          AND con.conkey = ARRAY[
              (
                  SELECT attnum
                  FROM pg_attribute
                  WHERE attrelid = rel.oid
                    AND attname = 'worker_id'
                    AND NOT attisdropped
              )
          ]
          AND con.confkey = ARRAY[
              (
                  SELECT attnum
                  FROM pg_attribute
                  WHERE attrelid = parent.oid
                    AND attname = 'id'
                    AND NOT attisdropped
              )
          ]
          AND con.confupdtype = 'c'
    ) THEN
        ALTER TABLE operator_worker_alert_state
            ADD CONSTRAINT operator_worker_alert_state_worker_id_fkey
            FOREIGN KEY (worker_id)
            REFERENCES workers(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM workers
        WHERE id = 'helix-rtx4060-01'
    )
    AND EXISTS (
        SELECT 1
        FROM workers
        WHERE id = 'comfy-rtx4060-01'
    ) THEN
        RAISE EXCEPTION
            'Cannot rename worker: both legacy and Comfy IDs exist';
    END IF;
END $$;

UPDATE workers
SET id = 'comfy-rtx4060-01',
    updated_at = NOW()
WHERE id = 'helix-rtx4060-01';

COMMIT;
