BEGIN;

ALTER TABLE media_jobs
ADD COLUMN IF NOT EXISTS profile_id TEXT;

-- Historical video jobs predate explicit profile identity. Nolan was their
-- sole production profile, so this is a non-destructive, bounded backfill.
UPDATE media_jobs
SET profile_id = 'nolan'
WHERE profile_id IS NULL
  AND tool IN ('video.t2v', 'video.i2v');

CREATE INDEX IF NOT EXISTS media_jobs_profile_id_idx
ON media_jobs (profile_id);

INSERT INTO production_profile_tool_settings (profile_id, tool, settings)
VALUES (
  'leibovitz',
  'image.t2i',
  '{"aspect":"1:1","seed":"random"}'::jsonb
)
ON CONFLICT (profile_id, tool) DO NOTHING;

CREATE TABLE IF NOT EXISTS operator_pending_t2i (
  chat_id TEXT PRIMARY KEY,
  phase TEXT NOT NULL CHECK (phase IN ('awaiting_prompt', 'awaiting_confirmation')),
  prompt TEXT,
  settings_snapshot JSONB,
  invalid_attempts INTEGER NOT NULL DEFAULT 0 CHECK (invalid_attempts >= 0 AND invalid_attempts <= 3),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operator_pending_t2i_expires_at_idx
ON operator_pending_t2i (expires_at);

CREATE TABLE IF NOT EXISTS operator_pending_t2i_reset (
  chat_id TEXT PRIMARY KEY,
  target_settings JSONB NOT NULL,
  invalid_attempts INTEGER NOT NULL DEFAULT 0 CHECK (invalid_attempts >= 0 AND invalid_attempts <= 3),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
