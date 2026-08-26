BEGIN;

ALTER TABLE operator_pending_t2v
ADD COLUMN IF NOT EXISTS confirmation_message_id TEXT;

ALTER TABLE operator_pending_t2i
ADD COLUMN IF NOT EXISTS confirmation_message_id TEXT;

CREATE TABLE IF NOT EXISTS telegram_job_lifecycles (
    job_id TEXT PRIMARY KEY
        REFERENCES media_jobs(id)
        ON DELETE CASCADE,

    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,

    presentation_state TEXT NOT NULL
        DEFAULT 'active'
        CHECK (
            presentation_state IN (
                'active',
                'terminal',
                'delivered'
            )
        ),

    last_job_status TEXT,

    created_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL
        DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS
    telegram_job_lifecycles_chat_message_idx
ON telegram_job_lifecycles (
    chat_id,
    message_id
);

CREATE INDEX IF NOT EXISTS
    telegram_job_lifecycles_active_idx
ON telegram_job_lifecycles (
    presentation_state,
    updated_at
);

COMMIT;
