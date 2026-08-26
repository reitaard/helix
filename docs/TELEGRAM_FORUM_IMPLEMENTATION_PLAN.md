# Telegram Forum Topics — Autonomous Implementation Plan

Status: implemented and deployed for forum routing; lifecycle/progress integration is merged to `main` but not yet deployed.
Date: 2026-08-26
Integration branch: `feature/telegram-forum-lifecycle-integration` (merged into `main` at `cf07d25`)
Runtime: `production/media-runtime`

## 1. Mission

Extend the existing single Telegram bot so it continues serving the Creator's private chat and also serves one private forum supergroup with two strictly separated generation topics. Keep one bot, one Helix runtime, one Comfy worker, and one GPU execution queue.

The implementation must be complete, tested, migrated, deployed, and smoke-tested. Do not create a second bot or a second worker identity.

## 2. Verified live routing data

- Bot: existing configured bot (`@christolanbot`); do not request, print, rotate, or commit its token.
- Forum group title: `Absolute Cinema`
- Forum chat ID: `-1004369617758`
- Image Generation thread ID: `5`
- Video Generation thread ID: `7`
- Existing private operator destination remains the current `HELIX_TELEGRAM_CHAT_ID`.

Live Bot API transport test completed on 2026-08-26:

- A silent test message sent with `message_thread_id=5` was returned by Telegram with thread ID `5`.
- A silent test message sent with `message_thread_id=7` was returned by Telegram with thread ID `7`.
- Both test messages were deleted successfully.
- `getChat` confirms the destination is a forum supergroup.

Do not repeat visible connection tests unnecessarily.

## 3. Product policy (fixed)

### Private chat

The existing private chat remains the operator surface and retains all current commands and capabilities, including diagnostics, queue inspection, downloads, job inspection, failures, cancellation, T2I, T2V, and developer settings.

### Image topic (`chat=-1004369617758`, `thread=5`)

Allow only the image-generation surface:

- `/t2i`
- `/t2i settings`
- `/t2i set asp ...`
- `/t2i set seed ...`
- `/t2i reset`
- topic-specific `/help`

Do not expose T2V, queue, downloads, outbox, diagnostics, failures, events, global job listings, or cancellation here.

### Video topic (`chat=-1004369617758`, `thread=7`)

Allow only the production video-generation surface:

- `/t2v`
- `/t2v settings`
- `/t2v mode` and normal mode changes
- `/t2v set asp ...`
- `/t2v set qual ...`
- `/t2v set time ...`
- `/t2v set enh ...`
- `/t2v reset` for core settings
- topic-specific `/help`

Do not expose `-dev`, FPS, seeds, negative prompt, megapixel override, sampler, CFG, diagnostics, downloads, queue, outbox, failures, events, global job listings, or cancellation here. Developer controls remain private-chat only.

### Membership and authorization

Any user who can post in `Absolute Cinema` may use generation and the allowed topic-specific production settings. No static generation-user allowlist is required.

Nevertheless, every update must retain `userId`, and pending interactions must be isolated by `(chatId, threadId, userId)`. Group membership is authorization for the allowed topic surface only; it does not grant the private operator surface.

Ignore channel posts, anonymous-admin posts without a usable sender identity, edited messages, and messages outside the configured private chat or the two configured forum routes.

### Wrong-topic behavior

- An image command in Video returns one compact pointer to the Image topic.
- A video command in Image returns one compact pointer to the Video topic.
- Operator commands in either generation topic return a compact “private operator chat only” response.
- Ordinary group conversation with no pending interaction is ignored.
- Validate an `@botusername` command suffix. Ignore commands explicitly addressed to another bot; do not strip and accept every suffix.

### Settings semantics

Keep the current persisted production-profile settings model. Settings are shared at profile/tool level, not per user. Every confirmed job must continue using a concrete settings snapshot so later changes cannot alter an already-started interaction.

Do not mix the known Telegram presentation cleanup into this feature. Reuse existing presenters where possible and change presentation only where routing requires it.

## 4. Required architecture

### 4.1 Telegram context

Introduce one canonical context type and pass it through routing, pending services, job creation, replies, and delivery:

```ts
interface TelegramContext {
  botId: string;
  botUsername: string;
  updateId: number;
  chatId: string;
  threadId: string | null;
  userId: string;
  messageId: string;
}
```

Use string IDs at domain/database boundaries to avoid JavaScript numeric precision assumptions. Keep `updateId` as a validated safe integer and pass it unchanged into generation submission so idempotency can be derived from `(botId, updateId)`. Parse Telegram's `message_thread_id`, `message.from.id`, `message.message_id`, `message.chat.type`, `message.is_topic_message`, and `reply_to_message` fields explicitly.

Add a route classification with exactly these outcomes:

```ts
type TelegramRoute =
  | { kind: "private_operator" }
  | { kind: "forum_image" }
  | { kind: "forum_video" }
  | { kind: "ignored" };
```

Keep route policy centralized; do not scatter raw chat/thread comparisons through feature services.

### 4.2 Configuration

Preserve the existing token and private chat variables. Add an all-or-none forum configuration:

- `HELIX_TELEGRAM_FORUM_CHAT_ID=-1004369617758`
- `HELIX_TELEGRAM_T2I_THREAD_ID=5`
- `HELIX_TELEGRAM_T2V_THREAD_ID=7`

Requirements:

- Validate IDs as integer strings; forum chat must be negative and thread IDs must be positive.
- Require all three forum values together or none.
- Forum configuration is invalid unless the Telegram token and private operator chat are configured.
- Reject identical image/video thread IDs and reject a forum chat ID equal to the private operator chat ID.
- Classify private traffic only when `chat.type === "private"`; classify forum traffic only when `chat.type === "supergroup"` and `is_topic_message === true`.
- Keep forum configuration optional so private-only deployments still work.
- Update `production/media-runtime/.env.example` and runtime README without secrets.
- Update `/opt/helix-runtime/telegram.env` only during the deployment phase; back it up first.

Do not replace `HELIX_TELEGRAM_CHAT_ID`; it remains the private operator chat.

### 4.3 Outbound transport

Refactor Telegram sending so every operation accepts an explicit destination:

```ts
interface TelegramDestination {
  chatId: string;
  threadId: string | null;
}
```

For forum destinations, include `message_thread_id` in all relevant Bot API requests:

- `sendMessage`
- multipart `sendDocument`
- downloads initiated from a topic, if those are ever enabled later

Private sends must omit `message_thread_id`, not send `0` or `null`.

The current private destination may remain the default only for legacy/operator alerts. Generation replies and artifact deliveries must always use the explicit originating destination.

### 4.4 Pending interaction isolation

Migrate T2I and T2V generation/reset pending tables from a `chat_id` primary key to a composite conversation key:

- `chat_id TEXT NOT NULL`
- `thread_id TEXT NOT NULL` (`"0"` represents no thread)
- `user_id TEXT NOT NULL`
- primary key `(chat_id, thread_id, user_id)`

Backfill existing private rows with `thread_id='0'` and `user_id=chat_id` so the migration is non-destructive.

Tables in scope:

- `operator_pending_t2v`
- `operator_pending_t2v_reset`
- `operator_pending_t2i`
- `operator_pending_t2i_reset`

The operator cancellation table may remain private-chat keyed because cancellation is not exposed in forum topics.

Update repositories and services to accept a conversation key/context instead of constructor-captured `chatId`. Expiry sweeps must expire all due records, not only one configured chat.

A new slash command should clear pending state only for that same `(chat, thread, user)`. It must never clear another user's or another topic's interaction.

### 4.5 ForceReply and privacy-safe interaction

Do not depend on the bot being an administrator or on receiving all group conversation. Keep compatibility with Telegram privacy mode.

The initial “send prompt” message must request a reply using both:

- `reply_parameters` referencing the initiating user's message; and
- `reply_markup: { force_reply: true, selective: true }`.

The confirmation card must remain editable so it can become the lifecycle/progress/final-media message. Telegram rejects edits to messages carrying `ForceReply` markup; therefore confirmation has no reply markup. It is still privacy-safe: persist its returned message ID as `expected_reply_message_id` and accept plain text only when it comes from the same conversation key and replies to that exact confirmation message. Replace the expected ID whenever a new prompt or confirmation is emitted.

Group handling must fail closed while the expected ID is unset. Define transaction/state recovery for partial failures: if Telegram send fails, remove/abort the newly created pending state; if Telegram send succeeds but persisting its message ID fails, log privately, attempt to delete the orphaned bot message, and abort the pending state. Never leave a group interaction accepting arbitrary text.

Private-chat behavior may remain permissive for backward compatibility, but group behavior must be reply-bound.

Inline callbacks are not required for this implementation. Do not expand scope unless ForceReply proves unworkable in a real Bot API test.

### 4.6 Durable job origin and delivery destination

A completed group job must return to its originating topic even after runtime restart. Do not rely on in-memory maps.

Persist an optional Telegram delivery destination with the accepted job and copy it into each generated `media_deliveries` row when the job succeeds. A concrete acceptable schema is:

- `media_jobs.delivery_context JSONB NULL`
- `media_deliveries.destination JSONB NULL`

Validate the JSON at TypeScript boundaries as:

```ts
{
  provider: "telegram";
  chatId: string;
  threadId: string | null;
  userId: string;
}
```

Requirements:

- Telegram-created jobs pass this context into `JobService.create()`.
- `JobRepository.createAccepted()` stores it separately from workflow data.
- `markSucceeded()` copies it into delivery rows transactionally.
- `DeliveryRepository.claimDue()` returns the destination.
- `DeliveryWorker` sends the artifact to that destination.
- Inject the configured route map into a delivery-time validator. Fail closed on every non-null destination that is not the configured private chat or configured forum route.
- Enforce tool/route invariants at delivery time: `image.t2i` may target only Image thread `5`; `video.t2v` may target only Video thread `7`; no group artifact may target General or an unknown thread. Private legacy/operator fallback remains allowed.
- Existing jobs/deliveries with a null destination retain the current private-chat fallback.
- API-created jobs retain current behavior unless an explicit destination is supplied internally.
- Never store the bot token in a job, event, request, or delivery row.

Include destination details (with IDs but no token) in relevant delivery audit events. A malformed or tool-mismatched destination must mark delivery failed with a sanitized reason and must never be sent.

### 4.7 Polling offsets

Replace unconditional startup discard with durable polling progress:

- Add `telegram_poll_offsets(bot_id TEXT PRIMARY KEY, next_update_id BIGINT NOT NULL, updated_at TIMESTAMPTZ NOT NULL)`.
- Resolve both `botId` and `botUsername` once with `getMe` during startup. If `getMe` fails or returns no username, polling fails closed.
- On first-ever startup with no row, initialize from Telegram's latest update to preserve the current no-backlog bootstrap behavior.
- Afterwards load the stored offset and persist progress after each handled or intentionally ignored update.
- PostgreSQL `BIGINT` is returned by `pg` as a string: parse it with explicit bounds checks into a JavaScript safe integer before constructing the Bot API payload. Never JSON-serialize a JavaScript `bigint`.
- A duplicate update must not create a duplicate GPU job. Use an idempotency key derived from bot ID and Telegram update ID for both T2I and T2V submissions.
- Pass `updateId` into both generation services. In confirmation handling, create the idempotent job before removing pending state; remove pending only after successful `JobService.create()`. Add crash/replay coverage for the boundary between creation and pending removal.

Do not run more than one `getUpdates` consumer for the same bot token.

### 4.8 Command routing

Split update parsing/routing from command presentation. The command service should:

1. Parse and validate the Telegram update.
2. Build `TelegramContext`.
3. Classify the route.
4. Validate command suffix.
5. Apply the route's command allowlist before mutating pending state.
6. Only an accepted command may clear pending state, and only for the same `(chat, thread, user)` key. Forbidden operator commands and wrong-topic pointers must not mutate pending state.
7. Dispatch to T2I/T2V/private operator services with context.
8. Send the response to the same destination.

Avoid cloning the full `TelegramCommandService` for each topic. There must remain one poller and one bot instance.

Do not register a misleading global Bot API command menu because Telegram command scopes are not topic-specific. Dynamic `/help` is authoritative unless a carefully scoped menu can be proven correct.

### 4.9 Alerts

Keep operational alerts in the existing private operator chat. Do not post worker failures or internal diagnostics into generation topics.

Immediate user-facing validation/submission errors should be returned to the originating topic. Introduce safe forum-facing error classes/codes and map unknown failures to a generic message with a correlation/job reference. Never send an arbitrary `Error.message`, workflow path, Comfy node ID, HTTP body, stack, or backend detail to a group topic; log full details privately/runtime-side. Backend failure alerts remain private; optionally add a compact originating-topic failure notice only if it can be durably routed and does not expose internal details.

### 4.10 GPU concurrency

Do not create `helix-worker-02` and do not run a second runtime. Both topics submit to `helix-rtx4060-01` and the same Comfy queue.

This feature does not claim that `maxConcurrentGpuJobs: 1` is an enforced Helix semaphore; it is currently worker metadata. Do not silently introduce an untested scheduler in this topic-routing change. Preserve the existing single Comfy queue and document that execution remains serial at the backend. A central admission scheduler can be a separate follow-up.

## 5. Migration safety

Create the next numbered migration; inspect the current highest migration before choosing the number. The migration must:

- run inside a transaction;
- preserve existing private pending state;
- add durable delivery destination fields;
- add polling offset storage;
- recreate required indexes and constraints;
- be idempotent where the repository's migration practice expects it;
- include comments for the private-row backfill assumptions.

Before production migration:

1. Back up the production database.
2. Record current pending-row counts.
3. Apply migration to a disposable/local database first.
4. Verify schema and backfill queries.
5. Apply once to production while the old runtime is stopped, because old code is incompatible with composite pending keys.

Provide and rehearse an explicit rollback strategy. At minimum:

- stop `helix-runtime` before backup/migration and keep it stopped until the new image is ready;
- create a timestamped custom-format backup with `pg_dump -Fc` from the database container/network context;
- run `pg_restore --list` to verify the archive is readable;
- record the exact old image ID and preserve the pre-change environment file;
- rehearse restore into a disposable database with `createdb`, `pg_restore --clean --if-exists`, and row/schema checks;
- document the production restore command and the fact that restoring discards jobs, deliveries, and polling offsets written after the backup.

A code rollback after the schema migration should either be supported by compatibility columns/views or require stopping all writers, restoring the verified pre-migration database backup, restoring the old environment, and starting the recorded old image. Do not improvise during deployment.

## 6. Required tests

Use project-owned `node:test` tests. Existing tests must continue passing.

At minimum add focused tests for:

### Routing

- Private configured chat becomes `private_operator`.
- Group thread 5 becomes `forum_image`.
- Group thread 7 becomes `forum_video`.
- General topic, unknown thread, other group, channel post, edited message, and senderless message are ignored.
- Commands addressed to another bot are ignored.
- Image command in Video and video command in Image produce the correct pointer.
- Operator commands are unavailable in both generation topics.
- Topic `/help` contains only that topic's commands/settings.
- `-dev` T2V access is rejected in the forum and remains available privately.

### Isolation

- Two users can have simultaneous pending Image interactions in thread 5.
- One user can have simultaneous Image and Video interactions.
- A command or reply in one topic does not abandon another topic's state.
- One user's reply cannot complete another user's prompt or confirmation.
- Group plain text not replying to the expected ForceReply message is ignored.
- Non-pending `yes`/`no` in a forum is ignored.
- Forbidden operator commands and wrong-topic pointers leave pending state unchanged.
- ForceReply includes both `reply_parameters` and selective reply markup; expected message IDs roll over correctly.
- Telegram send failure after pending creation aborts that pending state.
- Expiry removes only due records and handles all routes.

### Transport

- Private `sendMessage` omits `message_thread_id`.
- Forum `sendMessage` includes the correct thread ID.
- Forum multipart `sendDocument` includes the correct thread ID.
- ForceReply payload is present only where intended.
- Telegram API errors do not leak the token.

### Delivery durability

- Job origin is persisted.
- Succeeded-job delivery rows copy the origin destination.
- Claimed delivery returns the destination.
- Artifact delivery after a simulated restart uses the stored topic.
- Legacy/null destination falls back to the private chat.
- Image output cannot route to Video and vice versa.
- Malformed, unknown-chat, General-topic, and tool/thread-mismatched non-null destinations fail closed without sending.
- Group-facing failures are sanitized and internal details remain in logs/private alerts.

### Polling

- First bootstrap initializes without replaying historical updates.
- Restart resumes from the stored offset.
- Intentionally ignored updates advance the offset.
- A repeated generation update uses the same idempotency key and does not create a duplicate job.
- PostgreSQL string `BIGINT` offsets are bounds-checked and converted correctly.
- A crash/replay between idempotent job creation and pending removal does not lose or duplicate a job.

### Regression

Run:

```bash
cd production/media-runtime
npm run typecheck
npm test
```

The final test suite must include Telegram routing/transport tests; a successful TypeScript build alone is insufficient.

## 7. Autonomous execution sequence

1. Confirm `git status` is clean and create `feature/telegram-forum-topics` from current `main`.
2. Read all files under `production/media-runtime/src/telegram`, delivery code, job/repository code, migrations, config, startup wiring, and existing tests before editing.
3. Implement pure context parsing and route policy first with unit tests.
4. Add configuration validation and examples.
5. Add migration and repository changes; test against disposable PostgreSQL.
6. Refactor pending services to context keys and expiry-all behavior.
7. Add explicit-destination Telegram transport and ForceReply support.
8. Persist job origin and delivery destination end-to-end.
9. Refactor command dispatch to route allowlists while preserving private behavior.
10. Add durable polling offsets and Telegram update idempotency.
11. Run typecheck and the complete test suite.
12. Request/read a focused code audit before deployment; fix concrete correctness findings.
13. Back up production DB and `/opt/helix-runtime/telegram.env`.
14. Stop the old runtime, apply migration, add the three forum environment variables, rebuild, and start exactly one runtime.
15. Verify `/v1/health`, logs, database connectivity, command poller readiness, and no polling conflict.
16. Smoke-test `/help` in each topic and private chat; delete test messages if practical.
17. Run one real T2I job from Image, restart `helix-runtime` while that job or its delivery is pending, and verify its document still returns only to thread 5.
18. Run one real T2V job from Video and verify its document returns only to thread 7.
19. Verify simultaneous pending sessions for two users if a second test user is available; otherwise cover this with integration tests and record the limitation.
20. Verify forbidden/wrong-topic commands do not disturb a pending interaction.
21. Verify no internal alerts or diagnostics appeared in either generation topic.
22. Record deployment commit, migration, image/container state, test results, verified backup/restore commands, and rollback checkpoint.

Never print or commit environment values containing tokens or database credentials.

## 8. Deployment acceptance criteria

The work is complete only when all are true:

- Existing private bot behavior still works.
- Any member of `Absolute Cinema` can start T2I in thread 5 and T2V in thread 7.
- Prompt and confirmation conversations are isolated by chat, topic, and user.
- Wrong-topic and unauthorized-surface commands cannot invoke hidden operations.
- Video developer settings are inaccessible from the group.
- Image topic exposes only image production settings.
- Video topic exposes only video production/core settings and modes.
- Artifacts return to the exact originating topic after runtime restart.
- Operational alerts remain private.
- One bot poller and one runtime are running.
- Existing and new tests pass.
- Live Image and Video smoke jobs route correctly.
- A documented, tested rollback checkpoint exists.

## 9. Explicit non-goals

- A second Telegram bot
- A second worker identity
- A second media-runtime process
- New generation tools for the “Other” topic
- AI/LLM command parsing
- Broad Telegram presentation cleanup
- Per-user production settings
- Group diagnostics or global cancellation
- A new GPU admission scheduler
- Webhook migration

## 10. Known files likely to change

This list is directional, not exhaustive:

- `production/media-runtime/src/config.ts`
- `production/media-runtime/src/index.ts`
- `production/media-runtime/src/telegram/command-service.ts`
- `production/media-runtime/src/telegram/t2i-service.ts`
- `production/media-runtime/src/telegram/t2v-service.ts`
- `production/media-runtime/src/telegram/t2i-reset-service.ts`
- `production/media-runtime/src/telegram/t2v-reset-service.ts`
- `production/media-runtime/src/delivery/telegram.ts`
- `production/media-runtime/src/delivery/worker.ts`
- `production/media-runtime/src/jobs/service.ts`
- `production/media-runtime/src/repositories/job-repository.ts`
- `production/media-runtime/src/repositories/delivery-repository.ts`
- T2I/T2V pending repositories
- a new route/context module under `src/telegram/`
- a new polling-offset repository
- the next SQL migration
- `production/media-runtime/.env.example`
- `production/media-runtime/README.md`
- new tests under `production/media-runtime/test/`

The implementing agent may improve module boundaries, but must preserve the fixed policy and acceptance criteria above.
