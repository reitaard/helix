BEGIN;

CREATE TABLE IF NOT EXISTS operator_alerts (
    id BIGSERIAL PRIMARY KEY,

    dedupe_key TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,

    job_id TEXT
        REFERENCES media_jobs(id)
        ON DELETE CASCADE,

    payload JSONB NOT NULL
        DEFAULT '{}'::jsonb,

    status TEXT NOT NULL
        DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'sending',
                'sent',
                'failed'
            )
        ),

    attempt_count INTEGER NOT NULL
        DEFAULT 0,

    next_attempt_at TIMESTAMPTZ,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS
    operator_alerts_due_idx
ON operator_alerts (
    status,
    next_attempt_at,
    created_at
);

CREATE INDEX IF NOT EXISTS
    operator_alerts_job_idx
ON operator_alerts (
    job_id,
    created_at DESC
);


CREATE TABLE IF NOT EXISTS
    operator_alert_cursors (
        name TEXT PRIMARY KEY,

        last_event_id BIGINT NOT NULL,

        updated_at TIMESTAMPTZ
            NOT NULL
            DEFAULT NOW()
    );

INSERT INTO operator_alert_cursors (
    name,
    last_event_id
)
SELECT
    'telegram-domain-events',
    COALESCE(MAX(id), 0)
FROM media_job_events
ON CONFLICT (name)
DO NOTHING;


CREATE TABLE IF NOT EXISTS
    operator_worker_alert_state (
        worker_id TEXT PRIMARY KEY
            REFERENCES workers(id)
            ON DELETE CASCADE,

        state TEXT NOT NULL
            DEFAULT 'unknown'
            CHECK (
                state IN (
                    'unknown',
                    'online',
                    'offline'
                )
            ),

        consecutive_failures INTEGER
            NOT NULL
            DEFAULT 0,

        consecutive_successes INTEGER
            NOT NULL
            DEFAULT 0,

        last_error TEXT,

        last_transition_at TIMESTAMPTZ,

        updated_at TIMESTAMPTZ
            NOT NULL
            DEFAULT NOW()
    );

COMMIT;
