BEGIN;

CREATE TABLE IF NOT EXISTS operator_pending_actions (
    chat_id TEXT PRIMARY KEY,

    action_type TEXT NOT NULL
        CHECK (
            action_type IN (
                'cancel_job'
            )
        ),

    job_id TEXT NOT NULL
        REFERENCES media_jobs(id)
        ON DELETE CASCADE,

    invalid_attempts INTEGER NOT NULL
        DEFAULT 0
        CHECK (
            invalid_attempts >= 0
            AND invalid_attempts <= 3
        ),

    expires_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
    operator_pending_actions_expires_idx
ON operator_pending_actions (
    expires_at
);

COMMIT;
