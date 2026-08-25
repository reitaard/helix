# Telegram Operator Design

> Creator-approved design guidance reconstructed from the Telegram/ComfyUI project discussion exported on 2026-08-25, then checked against the current runtime implementation. This document governs future Telegram presentation work; current code may still contain older formatting that should be migrated carefully rather than changed opportunistically.

## Purpose

Telegram is a compact operator surface for Helix Production. It provides diagnostics, job inspection, confirmed generation/cancellation, alerts, and original-artifact delivery. It is not a general control plane and must not expose shell, package, restart, update, or arbitrary worker mutation.

## Design process

1. Inspect the current rendered message and the exact code producing it before proposing a change.
2. For a broad format revision, show the current format and collect Creator corrections first.
3. Do not implement while the Creator is still reviewing formats. Implement only after explicit approval such as “execute”, “make changes”, or equivalent.
4. Treat every approved example literally: punctuation, brackets, bold/italic/underline, quote behavior, and blank lines are part of the contract.
5. Change related messages together. Search every Telegram presenter so an old variant is not left behind.
6. Preview exact Telegram HTML, not Markdown approximations.
7. Check for accidental leading, trailing, or repeated blank lines. The Creator repeatedly prefers no unexplained gaps.
8. After changes, run typecheck, build, `git diff --check`, and inspect the complete diff. Verify deployed output separately when deployment is requested.

## Visual language

### General

- Use Telegram HTML parse mode.
- No emojis.
- Keep messages compact, modern, and easy to scan or copy.
- Avoid decorative text that does not add operational meaning.
- Do not register or force Telegram’s command menu; commands remain available without a forced menu.
- Use bold for labels and important states.
- Use bold italic for selected emphasis where the approved format calls for it.
- Use italic alone for units, durations, secondary notes, and quiet helper text.
- Use monospace for commands, technical event names, filenames, sampler values, and IDs only where the specific view calls for it. Do not monospace every value.
- Use underline to identify a selected option in a fixed choice list.
- Use exact aspect brackets `⦗16:9⦘`; do not replace them with ordinary parentheses or square brackets.

### Titles

Primary command pages use compact square-bracket titles:

```text
[ STATUS ]
[ QUEUE ]
[ JOBS ]
[ OUTBOX ]
[ T2V / SETTINGS ] (dev)
[ T2V / MODE ]
```

Internal section headings may use the dot form in lowercase:

```text
• system •
• core •
• advanced •
• options •
• generation •
```

Do not restore the old `• TITLE •` form for primary page titles.

### Spacing and quote blocks

- Do not insert a blank line immediately after a primary title unless the approved message explicitly includes one.
- Keep the worker hierarchy contiguous, with no blank line between its two lines:

```text
Worker > Christopher Nolan
└ video.t2v
```

- Use quote blocks to group related details, not as decoration.
- Use expandable quotes for genuinely long content: prompts, sampler lists, long option lists, event timelines, and detailed generation snapshots.
- Do not collapse the main settings panel.
- Three-choice settings such as Quality and FPS remain visible rather than collapsed.
- Views with no options may omit an `options` heading while retaining the quote around the detail block.
- In `/jobs`, each job is one compact quote block without blank lines inside it.

## Identity and naming

- Root system: **Helix**.
- Production service/runtime names should describe the Comfy service boundary, not pretend every subsystem is Helix.
- Durable worker ID: `helix-rtx4060-01` in the current verified branch state.
- Operator-facing worker name: **Christopher Nolan**.
- Operator-facing messages use **Christopher Nolan**; durable IDs remain internal unless a technical view explicitly requires them.
- Use actual Helix tool names such as `video.t2v` and `video.i2v`, not generic labels such as `COMFY • GEN`.
- Generation behavior is called a **Mode**, not a profile. Current modes are Manual, Fast, and Quality. There is no Auto mode.

## IDs and states

ID length is view-specific:

- `/jobs`: full job ID; this view is the copy source.
- `/events`: full job ID in the header and the complete durable timeline.
- failure/error views: full job ID unless the Creator explicitly requests compact form.
- `/job` detail and compact delivery metadata may use the approved short form.
- Input parsing accepts full IDs, prefixes, and a copied short ID ending in `...` when unambiguous.

Use bracketed state where the approved format shows it:

```text
[queued]
[running]
[succeeded]
[failed]
```

Do not add stray punctuation after an ID or quote block.

## T2V settings contract

### Commands

```text
/t2v settings
/t2v s
/t2v s <setting> <value>
/t2v set
/t2v set <setting> <value>
/t2v settings -dev
/t2v set -dev <setting>
/t2v set -dev <setting> <value>

/t2v settings -d
/t2v set -d <setting>
/t2v set -d <setting> <value>
```

`s` opens the panel without a setting, or changes a setting when given `<setting> <value>`; `set` remains its full alias. Use exactly one dash; `-dev` and its short alias `-d` are both accepted.

`-dev` is explicit per-command higher authority, not a persistent toggle. It can inspect/change Core and Advanced settings. An Advanced setting without `-dev` returns only:

```text
Dev access required.
```

Accept approved abbreviations and full names. Important aliases include `seed`/`seed1` for Stage 1 and `seed2` for Stage 2.

### Core

```text
asp   Aspect
qual  Quality
time  Duration
enh   Enhance
```

Canonical labels and choices:

- Aspect uses `⦗ratio⦘` plus its human label.
- Quality choices are Low / Standard / High; underline the selected value.
- Duration renders as `(N)s` with `(Max=10s)`.
- Enhance renders as `[ ON ]` or `[ OFF ]`; OFF is the default.

### Advanced

```text
fps    FPS
seed   Stage 1 seed
seed2  Stage 2 seed
neg    Negative prompt
mp     Megapixels
samp   Sampler
cfg    Guidance
```

The settings panel uses two non-collapsed quote blocks headed `• core •` and `• advanced •`. Long per-setting option lists such as Aspect and Sampler may be expandable.

A successful setting change is a single compact result, not a separate `[ SAVED ]` line:

```text
[ FPS : 30 ]
[ Duration : (8)s ]
[ Aspect : ⦗1:1⦘ (Square) ]
```

### Verified baseline

```text
Aspect       16:9
Quality      Standard (0.9 MP effective)
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

The workflow resolves that baseline to `1280x704`, 121 frames, and about 5.04 seconds because dimensions are snapped to a multiple of 32.

## Confirmation behavior

Generation, cancellation, and reset are important actions and use terminal-style confirmation:

- accept case-insensitive `yes` or `no`;
- no destructive Telegram buttons;
- confirmation lifetime: 60 seconds;
- maximum invalid replies: 3;
- after the third invalid reply, abort and clear pending state;
- quiet expiry: do not emit a timer-driven expiry message;
- a new slash command silently abandons the pending confirmation and runs the new command;
- no job is created until T2V generation is confirmed;
- the confirmation preview freezes the effective settings so later changes cannot alter the shown generation.

Keep confirmation copy compact and explicit about whether the job continues or no job was submitted.

## Jobs, events, errors, and outbox

- `/events` is a debugging view: preserve actual durable event names and show timestamps.
- Show the complete event timeline rather than arbitrarily hiding older events.
- `/errors` covers recent job and terminal Outbox failures; cancelled jobs are not errors.
- Worker outages belong in status/alerts rather than `/errors`.
- `/outbox` is the operator term for delivery/send state; do not expose database table names.
- Do not insert an extra blank line before `Outbox is clear.`
- In `/job`, keep the Outbox section outside the expandable generation-details quote.

## Artifact delivery

- Deliver the generated file with Telegram `sendDocument`, not `sendVideo`, to preserve the original Comfy artifact without Telegram video transcoding.
- Disable content-type detection for the document upload.
- Include compact metadata: actual tool, runtime, video dimensions/duration/size, audio present/absent, worker display name, completed state/time, and job reference.
- Use the actual tool (`video.t2v`, `video.i2v`) as the generation heading.
- Temporary spool files must be removed after delivery attempts according to the runtime’s bounded delivery policy.

## Command aliases

Current approved short aliases include:

```text
/st, /stat  -> /status
/qu, /que   -> /queue
/jbs        -> /jobs
/jb         -> /job
/ob         -> /outbox
/err        -> /errors
/ev         -> /events
/cc         -> /cancel
/h          -> /help
/t2v m      -> /t2v mode
```

Do not invent many aliases for destructive actions.

## Implementation guidance

- Centralize escaping, titles, ID formatting, durations, timestamps, and reusable presentation fragments.
- Keep command parsing, state transitions, repositories, and presentation separate.
- Do not duplicate formatting helpers across `command-service.ts`, delivery, and feature presenters.
- Prefer small named presenters over large inline HTML concatenations.
- Preserve durable state and audit events independently from Telegram copy.
- Never expose raw Comfy node IDs or graph-specific controls as the stable operator contract.
- Treat Telegram output as a tested presentation contract. Add focused snapshot/unit tests before another broad style refactor.

## Verified implementation gaps (2026-08-25)

The current branch builds and contains the approved durable T2V settings, reset, modes, job snapshots, and Telegram workflows. Inspection also found presentation debt to address deliberately in a later formatting pass:

- `command-service.ts` still duplicates helpers already present in `telegram/presentation.ts`.
- `delivery/telegram.ts` and `job-generation-presentation.ts` also define local escaping/ID or formatting logic.
- Some older alert/cancel/debug messages still use formatting variants from before the final settings design.
- The package has typecheck/build scripts but no project-owned Telegram presentation test suite.

Do not mix this cleanup into unrelated behavior changes. First capture current output with tests, then centralize presentation without changing semantics.