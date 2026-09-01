# Telegram Operator Design

> Canonical presentation and interaction guidance for the Helix Telegram surface. Updated 2026-09-01 to reconcile private-operator behavior, forum-topic generation, and lifecycle/progress implementation.

## Purpose

Telegram is a compact operator and bounded generation surface for Helix Production. It provides diagnostics, job/media inspection, confirmed generation/cancellation, alerts, settings, and original-artifact delivery.

It is **not** a general control plane. Do not expose shell execution, package updates, worker restart, arbitrary file mutation, or unrestricted Comfy controls.

## Design process

1. Inspect current rendered output and the exact presenter/service before changing formatting.
2. Treat approved examples literally: punctuation, brackets, emphasis, quote behavior, and blank lines are part of the contract.
3. Change related message families together rather than leaving old variants behind.
4. Preview Telegram HTML, not Markdown approximations.
5. Preserve durable state/audit behavior independently from presentation copy.
6. Run typecheck and the project-owned Telegram/runtime tests after behavior or presentation changes.

## Visual language

- Telegram HTML parse mode.
- No decorative emoji-heavy presentation.
- Compact, modern, easy to scan/copy.
- Bold for labels and important states.
- Italic/bold-italic only where the approved grammar uses it.
- Monospace for commands, IDs, filenames, sampler values, technical event names, and progress bars where appropriate.
- Underline selected values in fixed-choice panels when the approved settings grammar calls for it.
- Keep exact aspect brackets such as `⦗16:9⦘`.
- Avoid unexplained blank lines.

Primary titles use compact square-bracket grammar such as:

```text
[ STATUS ]
[ QUEUE ]
[ JOBS ]
[ OUTBOX ]
[ T2V / SETTINGS ]
[ T2V / MODE ]
```

## Identity and naming

- Root system: **Helix**.
- Physical worker ID: `helix-rtx4060-01`.
- Video Production profile: **Christopher Nolan**.
- Image Production profile: **Annie Leibovitz**.
- Production profile identity is presentation/tool authority; it is not physical worker identity.
- Generation behavior is called a **Mode**, not a profile. Current T2V modes are Manual, Fast, and Quality. There is no Auto mode.
- Use actual Helix tool names such as `video.t2v`, `video.i2v`, and `image.t2i`.

## Operator media references

The operator surface uses one durable numeric media-reference namespace shared across Helix jobs and direct ComfyUI artifacts.

```text
52
```

may be used consistently with:

```text
/jb 52
/dl i 52
/dl g 52
```

Internal Helix `job_...` IDs and Comfy Prompt IDs remain separate technical identities. Legacy IDs/prefixes remain accepted only where compatibility requires them.

Do not reintroduce a second independent Download ID or a Prompt-prefix presentation namespace.

## Generation lifecycle cards

T2I and T2V use one compact lifecycle grammar across private chat and forum topics.

Representative running form:

```html
<b>[ GENERATING ]</b>
<b>Annie Leibovitz</b> <b>//</b> Job · <code>60</code>
└ <code>image.t2i</code>
<code>Workflow  █░░░░░░░░░  13%</code>
<code>Sampling  ░░░░░░░░░░  --</code>
CLIP Text Encode (Positive) · <b><i>Running (15s)</i></b>
```

Rules:

- no blank lines inside the lifecycle hierarchy;
- second row is `<worker> // Job · <number>`;
- third row is `└ <tool>`;
- Workflow is always shown while generating;
- Sampling is shown separately and may display `--` before numeric sampler progress exists;
- the stage row owns elapsed time;
- do not fabricate a percentage for stages without meaningful numeric progress;
- queued/uploading/retry/failure/cancelled variants retain the same identity hierarchy.

WebSocket progress is presentation telemetry only. PostgreSQL plus Comfy queue/history reconciliation remain durable job truth.

## Private operator interaction

Private chat keeps the full bounded operator surface and direct text confirmation behavior where already established.

Important actions such as generation, cancellation, and reset may use case-insensitive `yes` / `no` confirmation with durable pending state, expiry, and invalid-response limits.

The old blanket statement "no destructive Telegram buttons" applies to the private operator confirmation model; it is **not** a ban on the forum inline-button interaction described below.

## Forum generation interaction

Forum routing exposes only the allowed generation surface for each configured topic.

### Prompt capture

Selective ForceReply is used only by bare `/t2i` and `/t2v` commands when free-text prompt capture is required.

- Settings, modes, help, usage, and result/toast messages must not force a reply.
- Image generation may also accept `/t2i <prompt>` inline and proceed directly to confirmation.
- Group free text is accepted only for the matching pending user/conversation and, for bare-command capture, only when replying to the expected ForceReply message.
- Delete the consumed ForceReply card after successful prompt capture so Telegram cannot reactivate it when the user switches topics.

### Forum confirmation buttons

After forum prompt capture:

```text
[ Generate ] [ Cancel ]
```

Forum reset confirmation uses:

```text
[ Reset ] [ Cancel ]
```

Callbacks must be bound to the originating `(chatId, threadId, userId)`, the exact confirmation message, expected action family, and unexpired pending state.

Reject repeated, expired, wrong-user, wrong-topic, and mismatched callbacks. Remove the keyboard after the first valid action.

Private operator chat retains its text-confirmation behavior; do not force the forum button UX into private chat unless a separate decision changes that policy.

## Forum authorization boundary

- Image topic exposes image generation/settings only.
- Video topic exposes video generation, normal settings, and normal modes only.
- T2V developer controls remain private-chat-only.
- Diagnostics, global jobs/downloads, failures, outbox, global cancellation, and other operator controls remain private-chat-only.
- Wrong-topic commands return compact pointers rather than mutating hidden state.
- Pending interaction state is isolated by chat, thread, and user.

## T2V settings contract

Core:

```text
asp   Aspect
qual  Quality
time  Duration
enh   Enhance
```

Advanced (`-dev` / `-d`):

```text
fps    FPS
seed   Stage 1 seed
seed2  Stage 2 seed
neg    Negative prompt
mp     Megapixels
samp   Sampler
cfg    Guidance
```

Current baseline:

```text
Aspect       16:9
Quality      Standard / 0.9 MP
Duration     5 s
Enhance      OFF
FPS          24
Stage1 seed  558811532553686
Stage2 seed  42
Negative     pc game, console game, video game, cartoon, childish, ugly
MP override  none / quality-derived
Sampler      euler_ancestral
Guidance     1.0
```

The settings surface represents Helix semantics. Do not expose raw Comfy node IDs as long-term operator controls.

## Modes

Current T2V modes:

```text
Manual
Fast
Quality
```

Modes overlay effective execution settings but never rewrite stored manual settings. There is no Auto mode.

## Jobs, events, errors, outbox, and downloads

- `/j`, `/jbs`, `/jobs` list Helix jobs with 20-item pagination.
- `/jb <number>` resolves Job/media detail through the shared media-reference namespace.
- `/dl` lists completed Comfy artifacts with the same numeric namespace.
- `/ev <number>` is a durable debugging/event timeline.
- `/errors` covers recent failures, not normal cancellations.
- `/outbox` is the operator term for durable delivery/send state.
- Keep worker outages in status/alerts rather than pretending they are media-job errors.

## Final artifact delivery

The baseline artifact policy is original-file delivery rather than Telegram video transcoding.

For ordinary/non-lifecycle delivery, use document/file delivery with compact metadata.

For Telegram-originated jobs with durable lifecycle ownership, the newer implementation may use `editMessageMedia` so the primary final document replaces the existing lifecycle message in its original conversation position.

Additional artifacts, and jobs without lifecycle ownership, may still use the normal new-message document path.

Do not state that every final artifact is always appended with `sendDocument`; that is no longer true for the lifecycle-owned primary artifact implementation.

## Delivery failures

When lifecycle-owned automatic primary delivery is retrying or terminally fails, keep that state on the same lifecycle target when possible. If retry budget is exhausted, provide the durable manual retrieval reference rather than losing the media identity.

## Command aliases

Approved short aliases include:

```text
/st, /stat  -> /status
/qu, /que   -> /queue
/j, /jbs    -> /jobs
/jb         -> /job
/ob         -> /outbox
/err        -> /errors
/ev         -> /events
/cc         -> /cancel
/h          -> /help
/t2v m      -> /t2v mode
```

Do not invent many aliases for destructive actions.

## Presentation implementation guidance

- Centralize escaping, title, ID, duration, timestamp, and reusable lifecycle formatting.
- Keep command parsing, routing, state transitions, repositories, and presentation separate.
- Prefer small named presenters over large inline HTML concatenation.
- Treat lifecycle/Telegram output as a tested contract.
- The repository now includes focused Telegram tests for routing, lifecycle/progress, forum buttons, delivery routing, and related behavior; the old note claiming there was no project-owned Telegram presentation test coverage is obsolete.

## Deployment-state note

Forum routing and lifecycle/progress code are separate concerns from whether the corresponding production migration/container revision is live.

The repository contains forum routing plus the newer lifecycle implementation. Before documentation says lifecycle/progress is live, verify the production database has migration `0014_telegram_job_lifecycle.sql` effects and verify the running runtime image contains the lifecycle/progress code.
