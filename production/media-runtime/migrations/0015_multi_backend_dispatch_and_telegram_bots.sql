BEGIN;

CREATE TABLE IF NOT EXISTS execution_resources (
    id TEXT PRIMARY KEY,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO execution_resources (id, capacity)
VALUES ('helix-gpu-rtx4060-01', 1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE workers
ADD COLUMN IF NOT EXISTS resource_id TEXT
    REFERENCES execution_resources(id);

UPDATE workers
SET resource_id = 'helix-gpu-rtx4060-01'
WHERE id = 'helix-rtx4060-01'
  AND resource_id IS NULL;

ALTER TABLE media_jobs
ADD COLUMN IF NOT EXISTS resource_id TEXT
    REFERENCES execution_resources(id),
ADD COLUMN IF NOT EXISTS dispatch_state TEXT NOT NULL DEFAULT 'pending'
    CHECK (dispatch_state IN ('pending', 'claimed', 'dispatched', 'completed')),
ADD COLUMN IF NOT EXISTS dispatch_token TEXT,
ADD COLUMN IF NOT EXISTS dispatch_claimed_at TIMESTAMPTZ;

UPDATE media_jobs j
SET resource_id = w.resource_id
FROM workers w
WHERE j.worker_id = w.id
  AND j.resource_id IS NULL;

UPDATE media_jobs
SET dispatch_state = CASE
    WHEN status IN ('succeeded', 'failed', 'cancelled', 'timed_out') THEN 'completed'
    WHEN backend_job_id IS NOT NULL THEN 'dispatched'
    ELSE 'pending'
END
WHERE dispatch_token IS NULL
  AND dispatch_claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS media_jobs_dispatch_fifo_idx
ON media_jobs (resource_id, dispatch_state, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS media_jobs_dispatch_token_idx
ON media_jobs (dispatch_token)
WHERE dispatch_token IS NOT NULL;

ALTER TABLE telegram_job_lifecycles
ADD COLUMN IF NOT EXISTS bot_key TEXT NOT NULL DEFAULT 'primary';
ALTER TABLE telegram_job_lifecycles
ADD COLUMN IF NOT EXISTS thread_id TEXT;

UPDATE telegram_job_lifecycles lifecycle
SET thread_id = jobs.request #>> '{deliveryContext,threadId}'
FROM media_jobs jobs
WHERE jobs.id = lifecycle.job_id
  AND lifecycle.thread_id IS NULL;

ALTER TABLE telegram_job_lifecycles
DROP CONSTRAINT IF EXISTS telegram_job_lifecycles_chat_message_key;

DROP INDEX IF EXISTS telegram_job_lifecycles_chat_message_idx;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_job_lifecycles_bot_chat_message_idx
ON telegram_job_lifecycles (bot_key, chat_id, message_id);

CREATE TABLE IF NOT EXISTS facefusion_telegram_conversations (
    bot_id TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    thread_id TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,
    phase TEXT NOT NULL CHECK (
        phase IN ('awaiting_source', 'awaiting_target', 'confirming')
    ),
    source_input_handle TEXT,
    target_input_handle TEXT,
    source_media_kind TEXT,
    target_media_kind TEXT,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    confirmation_message_id TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bot_id, chat_id, thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS facefusion_conversations_expiry_idx
ON facefusion_telegram_conversations (expires_at);

COMMIT;
