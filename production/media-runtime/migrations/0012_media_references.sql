BEGIN;

CREATE TABLE IF NOT EXISTS media_references (
    reference_number BIGINT PRIMARY KEY
        DEFAULT nextval('media_jobs_job_number_seq'),

    kind TEXT NOT NULL,

    job_id TEXT
        REFERENCES media_jobs(id)
        ON DELETE CASCADE,

    backend_job_id TEXT,

    first_seen_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    CHECK (
        (
            kind = 'job'
            AND job_id IS NOT NULL
            AND backend_job_id IS NULL
        )
        OR
        (
            kind = 'comfy_artifact'
            AND job_id IS NULL
            AND backend_job_id IS NOT NULL
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS media_references_job_idx
    ON media_references (job_id)
    WHERE job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS media_references_comfy_backend_idx
    ON media_references (backend_job_id)
    WHERE kind = 'comfy_artifact';

INSERT INTO media_references (
    reference_number,
    kind,
    job_id,
    first_seen_at
)
SELECT
    job_number,
    'job',
    id,
    created_at
FROM media_jobs
ON CONFLICT (reference_number)
DO NOTHING;

CREATE OR REPLACE FUNCTION register_media_job_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO media_references (
        reference_number,
        kind,
        job_id,
        first_seen_at
    )
    VALUES (
        NEW.job_number,
        'job',
        NEW.id,
        NEW.created_at
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS media_jobs_register_reference
    ON media_jobs;

CREATE TRIGGER media_jobs_register_reference
AFTER INSERT ON media_jobs
FOR EACH ROW
EXECUTE FUNCTION register_media_job_reference();

COMMIT;
