BEGIN;

CREATE TABLE IF NOT EXISTS
    operator_pending_t2v_reset (
        chat_id TEXT PRIMARY KEY,

        scope TEXT NOT NULL
            CHECK (
                scope IN (
                    'core',
                    'all'
                )
            ),

        current_settings JSONB NOT NULL,
        target_settings JSONB NOT NULL,

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
    operator_pending_t2v_reset_expires_idx
ON operator_pending_t2v_reset (
    expires_at
);

COMMIT;
