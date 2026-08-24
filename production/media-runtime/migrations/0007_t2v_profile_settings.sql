BEGIN;

CREATE TABLE IF NOT EXISTS
    production_profile_tool_settings (
        profile_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        settings JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL
            DEFAULT NOW(),
        PRIMARY KEY (
            profile_id,
            tool
        )
    );

INSERT INTO
    production_profile_tool_settings (
        profile_id,
        tool,
        settings
    )
VALUES (
    'nolan',
    'video.t2v',
    '{
      "aspect":"16:9",
      "quality":"standard",
      "durationSeconds":5,
      "enhance":false,
      "fps":24,
      "seed":558811532553686,
      "seed2":42,
      "negativePrompt":"pc game, console game, video game, cartoon, childish, ugly",
      "megapixelsOverride":null,
      "sampler":"euler_ancestral",
      "cfg":1
    }'::jsonb
)
ON CONFLICT (
    profile_id,
    tool
)
DO NOTHING;

ALTER TABLE
    operator_pending_t2v
ADD COLUMN IF NOT EXISTS
    settings_snapshot JSONB;

COMMIT;
