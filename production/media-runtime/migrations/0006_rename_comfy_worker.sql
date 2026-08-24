BEGIN;

-- Migrate the durable Comfy worker ID without losing its dependent lineage.
-- The current schema defines these foreign keys with ON UPDATE NO ACTION.
-- Recreate only the worker-ID foreign keys as ON UPDATE CASCADE before
-- changing the parent primary key.
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT con.conname
        FROM pg_constraint AS con
        JOIN pg_class AS rel
            ON rel.oid = con.conrelid
        JOIN pg_namespace AS ns
            ON ns.oid = rel.relnamespace
        JOIN pg_class AS parent
            ON parent.oid = con.confrelid
        WHERE con.contype = 'f'
          AND ns.nspname = current_schema()
          AND parent.relname = 'workers'
          AND rel.relname IN (
              'worker_observations',
              'media_jobs',
              'operator_worker_alert_state'
          )
          AND con.confupdtype <> 'c'
    LOOP
        EXECUTE format(
            'ALTER TABLE %I DROP CONSTRAINT %I',
            current_schema(),
            constraint_name
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
        WHERE con.contype = 'f'
          AND rel.relname = 'worker_observations'
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
        WHERE con.contype = 'f'
          AND rel.relname = 'media_jobs'
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
        WHERE con.contype = 'f'
          AND rel.relname = 'operator_worker_alert_state'
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
