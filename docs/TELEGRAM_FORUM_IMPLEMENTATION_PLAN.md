# Telegram Forum Topics — Historical Implementation Record

Status: **forum routing is implemented in the repository and was previously verified deployed; this file is no longer the active execution plan. Lifecycle/progress deployment status is tracked separately and must be verified against the VPS.**

Original implementation date: 2026-08-26

Current canonical behavior: [`TELEGRAM_DESIGN.md`](TELEGRAM_DESIGN.md)

Lifecycle implementation record: [`TELEGRAM_LIFECYCLE_PROGRESS_IMPLEMENTATION.md`](TELEGRAM_LIFECYCLE_PROGRESS_IMPLEMENTATION.md)

Canonical project checkpoint: [`PROJECT_STATE.md`](PROJECT_STATE.md)

## Mission that was implemented

Extend the existing single Telegram bot so it serves both the Creator's private operator chat and one private forum supergroup with strictly separated Image and Video generation topics while preserving:

```text
one bot
one helix-runtime
one Comfy worker
one physical GPU queue
```

No second bot, worker identity, or runtime process was introduced.

## Verified forum routing

The implemented forum uses one Image generation topic and one Video generation topic.

Policy:

```text
Image topic
-> image.t2i surface only

Video topic
-> video.t2v surface + normal T2V settings/modes

Private operator chat
-> diagnostics, jobs/downloads, failures/events/outbox,
   cancellation, T2I/T2V, and T2V developer controls
```

Operator-only commands and T2V `-dev` controls remain private-chat-only.

## Authorization and conversation isolation

Forum membership authorizes only the topic-appropriate generation surface.

Every interaction retains user identity and pending state is isolated by:

```text
(chatId, threadId, userId)
```

A user's Image interaction cannot consume another user's state or that same user's Video interaction.

Unknown chats/threads, unsupported update forms, and wrong-surface commands fail closed or return compact routing guidance without mutating unrelated pending state.

## Prompt capture and confirmation

The final forum interaction differs from the earliest implementation draft and should be understood from current code/design rather than the original plan text.

Current forum rules:

- bare `/t2i` and `/t2v` use selective ForceReply only for free-text prompt capture;
- Image also supports inline `/t2i <prompt>` capture;
- group free text is accepted only for the correct pending conversation/user and expected prompt-capture reply;
- the consumed ForceReply card is deleted after prompt capture;
- generation confirmation uses inline `[ Generate ] [ Cancel ]` buttons;
- reset confirmation uses `[ Reset ] [ Cancel ]`;
- callbacks are bound to exact chat/thread/user/message/action state;
- repeated, expired, wrong-user, wrong-topic, and mismatched callbacks fail closed;
- private operator chat retains direct text confirmation.

This supersedes the earlier draft assumption that inline callbacks were unnecessary.

## Durable origin and delivery routing

Telegram-created jobs persist their delivery origin so completed artifacts can return to the exact originating destination after runtime restart.

The forum migration introduced durable routing state and conversation-key changes rather than relying on in-memory maps.

Delivery-time validation must continue to fail closed on unknown destinations or tool/topic mismatch:

```text
image.t2i -> Image topic only
video.t2v -> Video topic only
```

Operational alerts remain private.

## Polling durability and idempotency

Forum work also introduced durable Telegram polling progress and update-aware/idempotent generation submission behavior so a restart/replayed update cannot freely create duplicate GPU work.

There must remain only one `getUpdates` consumer for the configured bot token.

## Migration checkpoint

Forum routing migration:

```text
0013_telegram_forum_topics.sql
```

was previously recorded as applied in Production.

The later lifecycle/progress migration is separate:

```text
0014_telegram_job_lifecycle.sql
```

Do not infer `0014` deployment from forum deployment. Verify the live production schema/runtime before updating lifecycle deployment claims.

## Regression expectations

The repository contains focused tests for forum routing, conversation isolation, delivery routing, polling behavior, lifecycle integration, confirmation buttons, and ForceReply behavior.

For current regression validation run:

```bash
cd production/media-runtime
npm run typecheck
npm test
```

Do not rely on the historical test-count numbers from the original implementation session as if they are permanently current.

## Acceptance properties that remain current

- Existing private operator behavior continues to work.
- Forum members can invoke only the allowed Image/Video generation surfaces.
- Pending interactions are isolated by chat/topic/user.
- Wrong-topic and operator-only commands cannot invoke hidden operations.
- T2V developer settings remain private.
- Artifacts persist their intended destination rather than depending on process memory.
- Operational alerts remain private.
- One bot poller and one runtime serve the configured bot.
- Both forum topics share the same physical RTX 4060/Comfy queue.

## Non-goals that remain current

- second Telegram bot;
- second physical worker identity;
- second media-runtime process;
- group diagnostics/global cancellation;
- arbitrary LLM command parsing inside Telegram routing;
- broad shell/control-plane access;
- per-user Production settings;
- an unvalidated GPU scheduler hidden inside the routing feature.

## Why this file was condensed

The original document was an autonomous implementation plan containing step-by-step instructions that became stale after the feature shipped and received follow-up fixes. Keeping those steps as if they were today's plan created contradictions with current code and `TELEGRAM_DESIGN.md`.

Git history remains the source for the original implementation sequence. This file now preserves the architectural intent, safety boundaries, migration identity, and acceptance properties while pointing current work to canonical docs.
