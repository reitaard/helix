BEGIN;

ALTER TABLE
    production_profile_tool_settings
ADD COLUMN IF NOT EXISTS
    generation_mode TEXT NOT NULL
        DEFAULT 'manual';

DO $$
BEGIN
    ALTER TABLE
        production_profile_tool_settings
    ADD CONSTRAINT
        production_profile_tool_settings_generation_mode_check
    CHECK (
        generation_mode IN (
            'manual',
            'fast',
            'quality'
        )
    );
EXCEPTION
    WHEN duplicate_object THEN
        NULL;
END
$$;

COMMIT;
