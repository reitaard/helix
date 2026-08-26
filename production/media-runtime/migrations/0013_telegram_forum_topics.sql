BEGIN;

-- Private pending rows predate forum topics. They belonged to the sole operator
-- chat, so use its chat id as a stable legacy user key and thread 0 for private.
ALTER TABLE operator_pending_t2v ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE operator_pending_t2v ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE operator_pending_t2v ADD COLUMN IF NOT EXISTS expected_reply_message_id TEXT;
UPDATE operator_pending_t2v SET thread_id = '0', user_id = chat_id WHERE thread_id IS NULL OR user_id IS NULL;
ALTER TABLE operator_pending_t2v ALTER COLUMN thread_id SET NOT NULL;
ALTER TABLE operator_pending_t2v ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE operator_pending_t2v DROP CONSTRAINT IF EXISTS operator_pending_t2v_pkey;
ALTER TABLE operator_pending_t2v ADD PRIMARY KEY (chat_id, thread_id, user_id);

ALTER TABLE operator_pending_t2v_reset ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE operator_pending_t2v_reset ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE operator_pending_t2v_reset ADD COLUMN IF NOT EXISTS expected_reply_message_id TEXT;
UPDATE operator_pending_t2v_reset SET thread_id = '0', user_id = chat_id WHERE thread_id IS NULL OR user_id IS NULL;
ALTER TABLE operator_pending_t2v_reset ALTER COLUMN thread_id SET NOT NULL;
ALTER TABLE operator_pending_t2v_reset ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE operator_pending_t2v_reset DROP CONSTRAINT IF EXISTS operator_pending_t2v_reset_pkey;
ALTER TABLE operator_pending_t2v_reset ADD PRIMARY KEY (chat_id, thread_id, user_id);

ALTER TABLE operator_pending_t2i ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE operator_pending_t2i ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE operator_pending_t2i ADD COLUMN IF NOT EXISTS expected_reply_message_id TEXT;
UPDATE operator_pending_t2i SET thread_id = '0', user_id = chat_id WHERE thread_id IS NULL OR user_id IS NULL;
ALTER TABLE operator_pending_t2i ALTER COLUMN thread_id SET NOT NULL;
ALTER TABLE operator_pending_t2i ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE operator_pending_t2i DROP CONSTRAINT IF EXISTS operator_pending_t2i_pkey;
ALTER TABLE operator_pending_t2i ADD PRIMARY KEY (chat_id, thread_id, user_id);

ALTER TABLE operator_pending_t2i_reset ADD COLUMN IF NOT EXISTS thread_id TEXT;
ALTER TABLE operator_pending_t2i_reset ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE operator_pending_t2i_reset ADD COLUMN IF NOT EXISTS expected_reply_message_id TEXT;
UPDATE operator_pending_t2i_reset SET thread_id = '0', user_id = chat_id WHERE thread_id IS NULL OR user_id IS NULL;
ALTER TABLE operator_pending_t2i_reset ALTER COLUMN thread_id SET NOT NULL;
ALTER TABLE operator_pending_t2i_reset ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE operator_pending_t2i_reset DROP CONSTRAINT IF EXISTS operator_pending_t2i_reset_pkey;
ALTER TABLE operator_pending_t2i_reset ADD PRIMARY KEY (chat_id, thread_id, user_id);

ALTER TABLE media_jobs ADD COLUMN IF NOT EXISTS delivery_context JSONB;
ALTER TABLE media_deliveries ADD COLUMN IF NOT EXISTS destination JSONB;

CREATE TABLE IF NOT EXISTS telegram_poll_offsets (
  bot_id TEXT PRIMARY KEY,
  next_update_id BIGINT NOT NULL CHECK (next_update_id >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
