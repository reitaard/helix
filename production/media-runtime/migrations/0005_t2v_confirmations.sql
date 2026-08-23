BEGIN;

CREATE TABLE IF NOT EXISTS
    operator_pending_t2v (
        chat_id TEXT PRIMARY KEY,

        phase TEXT NOT NULL
            CHECK (
                phase IN (
                    'awaiting_prompt',
                    'awaiting_confirmation'
                )
            ),

        prompt TEXT,

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
            DEFAULT NOW(),

        CHECK (
            (
                phase = 'awaiting_prompt'
                AND prompt IS NULL
            )
            OR
            (
                phase = 'awaiting_confirmation'
                AND prompt IS NOT NULL
            )
        )
    );

CREATE INDEX IF NOT EXISTS
    operator_pending_t2v_expires_idx
ON operator_pending_t2v (
    expires_at
);

COMMIT;
