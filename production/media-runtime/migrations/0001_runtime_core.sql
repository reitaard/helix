BEGIN;

CREATE TABLE workers (
    id TEXT PRIMARY KEY,
    profile TEXT NOT NULL,
    adapter TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE worker_observations (
    id BIGSERIAL PRIMARY KEY,

    worker_id TEXT NOT NULL
        REFERENCES workers(id)
        ON DELETE CASCADE,

    state TEXT NOT NULL,

    runtime_ok BOOLEAN NOT NULL,
    queue_ok BOOLEAN NOT NULL,
    capabilities_ok BOOLEAN NOT NULL,
    events_ok BOOLEAN NOT NULL,

    latency_ms INTEGER,

    queue_running INTEGER,
    queue_pending INTEGER,

    capability_count INTEGER,

    backend_version TEXT,

    device JSONB,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,

    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX worker_observations_worker_time_idx
    ON worker_observations (
        worker_id,
        observed_at DESC
    );


CREATE TABLE media_jobs (
    id TEXT PRIMARY KEY,

    project_id TEXT,

    tool TEXT NOT NULL,

    status TEXT NOT NULL,

    worker_id TEXT
        REFERENCES workers(id),

    adapter TEXT,

    backend_job_id TEXT,

    idempotency_key TEXT UNIQUE,

    request JSONB NOT NULL DEFAULT '{}'::jsonb,

    result JSONB,

    error JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX media_jobs_status_created_idx
    ON media_jobs (
        status,
        created_at
    );

CREATE INDEX media_jobs_worker_idx
    ON media_jobs (
        worker_id
    );


CREATE TABLE media_job_events (
    id BIGSERIAL PRIMARY KEY,

    job_id TEXT NOT NULL
        REFERENCES media_jobs(id)
        ON DELETE CASCADE,

    sequence INTEGER NOT NULL,

    event_type TEXT NOT NULL,

    stage TEXT,

    payload JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (
        job_id,
        sequence
    )
);

CREATE INDEX media_job_events_job_idx
    ON media_job_events (
        job_id,
        sequence
    );

COMMIT;
