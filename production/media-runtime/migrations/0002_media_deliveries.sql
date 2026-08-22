BEGIN;

CREATE TABLE IF NOT EXISTS media_deliveries (
    id BIGSERIAL PRIMARY KEY,

    job_id TEXT NOT NULL
        REFERENCES media_jobs(id)
        ON DELETE CASCADE,

    artifact_index INTEGER NOT NULL,
    artifact JSONB NOT NULL,

    provider TEXT NOT NULL,

    status TEXT NOT NULL
        DEFAULT 'pending',

    attempt_count INTEGER NOT NULL
        DEFAULT 0,

    next_attempt_at TIMESTAMPTZ
        DEFAULT NOW(),

    metadata_message_id TEXT,
    document_message_id TEXT,

    error JSONB,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    delivered_at TIMESTAMPTZ,

    UNIQUE (
        job_id,
        artifact_index,
        provider
    ),

    CHECK (
        status IN (
            'pending',
            'delivering',
            'failed',
            'delivered'
        )
    )
);

CREATE INDEX IF NOT EXISTS
    media_deliveries_due_idx
ON media_deliveries (
    provider,
    status,
    next_attempt_at
);

CREATE INDEX IF NOT EXISTS
    media_deliveries_job_idx
ON media_deliveries (
    job_id
);

COMMIT;
