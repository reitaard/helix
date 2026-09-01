# Telegram Forum Topics — Historical Implementation Record

Status: **forum routing is implemented. This file is historical; current behavior is defined by `TELEGRAM_DESIGN.md` and `PROJECT_STATE.md`.**

Original implementation date: 2026-08-26

Current canonical behavior: [`TELEGRAM_DESIGN.md`](TELEGRAM_DESIGN.md)

Lifecycle implementation record: [`TELEGRAM_LIFECYCLE_PROGRESS_IMPLEMENTATION.md`](TELEGRAM_LIFECYCLE_PROGRESS_IMPLEMENTATION.md)

Canonical project checkpoint: [`PROJECT_STATE.md`](PROJECT_STATE.md)

## Implemented topology

The existing single Telegram bot serves the private operator chat and one private forum supergroup with separate Image and Video generation topics while preserving one runtime, one Comfy worker, and one physical GPU queue.

```text
Image topic
-> image.t2i surface only

Video topic
-> video.t2v surface + normal T2V settings/modes

Private operator chat
-> diagnostics, jobs/downloads, failures/events/outbox,
   cancellation, T2I/T2V, and T2V developer controls
```

## Conversation isolation

Pending forum interaction state is isolated by:

```text
(chatId, threadId, userId)
```

A user's Image interaction cannot consume another user's state or that same user's Video interaction. Wrong-topic or unsupported interactions must not mutate unrelated pending state.

## Current prompt-capture model

The current repository no longer uses Telegram ForceReply behavior.

For bare `/t2i` and `/t2v` in their allowed forum topics:

1. Helix creates durable `awaiting_prompt` state for the exact chat/topic/user.
2. Helix sends an ordinary prompt card.
3. The next plain-text message from that same scoped conversation is accepted while `awaiting_prompt` remains active.
4. No Telegram reply relation is required.
5. The prompt card is removed after successful capture.
6. A new slash command abandons the pending prompt and removes the old prompt card where possible.

Image also supports inline `/t2i <prompt>`.

After prompt capture, generation confirmation uses:

```text
[ Generate ] [ Cancel ]
```

Reset confirmation uses:

```text
[ Reset ] [ Cancel ]
```

Callbacks remain bound to the exact chat/thread/user/message/action state. The current callback cleanup removes the keyboard without sending an empty inline-keyboard object.

Private operator chat retains its direct text-confirmation behavior.

## Durable origin and delivery routing

Telegram-created jobs persist their destination so completed artifacts return to the exact originating conversation after runtime restart.

Delivery routing continues to enforce the tool/topic boundary:

```text
image.t2i -> Image topic only
video.t2v -> Video topic only
```

Operational alerts remain private.

## Polling durability and idempotency

Forum work introduced durable Telegram polling progress and update-aware generation submission behavior. There must remain only one `getUpdates` consumer for the configured bot token.

## Migration checkpoint

Forum routing migration:

```text
0013_telegram_forum_topics.sql
```

was previously verified applied in Production.

Lifecycle migration:

```text
0014_telegram_job_lifecycle.sql
```

was verified applied on the VPS on 2026-09-01, together with the lifecycle/progress runtime layer.

The newest interaction commits are:

```text
d81e78f  scoped next-message prompt capture
02c2aa1  callback keyboard cleanup
```

They were pushed to `main` after the inspected runtime-container checkpoint. Their repository behavior is validated; their exact live-container deployment still needs rebuild/restart and a forum smoke test.

## Regression checkpoint

Post-rebase media-runtime validation on 2026-09-01:

```text
57 tests
57 pass
0 fail
```

Coverage includes forum routing, conversation isolation, lifecycle integration, confirmation buttons, scoped next-message prompt capture, callback cleanup, and a transport assertion that ordinary prompt-card delivery does not emit `force_reply` or `selective` markup.

For current validation:

```bash
cd production/media-runtime
npm run typecheck
npm test
```

## Acceptance properties that remain current

- Existing private operator behavior continues to work.
- Forum members can invoke only the allowed Image/Video generation surfaces.
- Pending interactions are isolated by chat/topic/user.
- Prompt capture is state-scoped, not reply-bound.
- Wrong-topic commands cannot invoke hidden operations.
- T2V developer settings remain private.
- Artifacts persist their intended destination rather than depending on process memory.
- One bot poller and one runtime serve the configured bot.
- Both forum topics share the same physical RTX 4060/Comfy queue.

## Why this file is historical

The original document was an implementation plan. Forum behavior subsequently changed through several fixes, so step-by-step historical instructions are no longer canonical. Git history preserves the implementation sequence; current work should follow `TELEGRAM_DESIGN.md` and `PROJECT_STATE.md`.
