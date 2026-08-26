# Project State

## Current phase

**Preparation / foundation with a mature single-worker Production execution slice, validated native LTX 2.5 T2V and FLUX.2 Klein T2I paths, persisted semantic settings/modes, Telegram operator controls, and one durable numeric media-reference namespace shared across Helix jobs and direct ComfyUI artifacts.**

The high-level Helix system division remains:

```text
Foundation
Intelligence
Director
Experiment Engine
Production
Distribution
Analytics / Feedback
```

The intended brain development order after preparation is still:

```text
Niche Intelligence -> Director -> Experiment Engine
```

Production/generation remains a separate workstream and must connect later through stable contracts rather than shaping the Intelligence or Helix Director model around ComfyUI/LTX details.

The current generation direction remains **open/self-hosted first**. Runway is not part of the active Production plan. Seedance-class systems remain behavioral/quality references where useful.

## Active Production architecture

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ├── helix-db
    │   ├── media_jobs
    │   ├── media_references
    │   ├── media_job_events
    │   ├── media_deliveries
    │   ├── operator state
    │   └── production settings
    │
    ├── TelegramCommandService
    ├── TelegramAlertService
    ├── TelegramCancelService
    ├── TelegramT2VService
    ├── TelegramT2IService
    ├── TelegramDownloadsService
    └── OutboxRepository
    ↓
ComfyAdapter / ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
```

Current worker facts:

```text
durable worker ID: helix-rtx4060-01
physical-worker name: Helix RTX 4060
GPU: RTX 4060
ComfyUI: 0.33.0
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
Python: 3.12.11
PyTorch: 2.10.0+cu130
max concurrent GPU jobs: 1
```

Logical Production profiles on that one worker:

```text
nolan
Christopher Nolan
-> video.i2v
-> video.t2v

leibovitz
Annie Leibovitz
-> image.t2i
```

Profiles describe tool authority/operator presentation, not additional hardware or queues.

## Numeric media-reference checkpoint

The original `0011_job_numbers.sql` work gave every Helix `media_jobs` row a unique sequential `BIGINT job_number` while preserving internal `job_...` primary keys and Comfy Prompt IDs.

The initial Telegram implementation still exposed six-character Comfy Prompt prefixes for direct/manual ComfyUI generations. That created two problems:

1. Jobs and Downloads did not truly use one operator identity system.
2. A Comfy Prompt prefix containing only digits, such as `161023`, was parsed as a numeric Job number and could not be retrieved even though `/dl` displayed it.

This is now corrected by migration:

```text
0012_media_references.sql
```

The database model is:

```text
media_jobs.job_number
        │
        └──── media_jobs_job_number_seq ────┐
                                             │
media_references.reference_number <─────────┘
```

`media_references` reserves every operator-visible number.

Helix-managed jobs:

```text
kind = job
reference_number = media_jobs.job_number
job_id = job_...
backend_job_id = NULL
```

Direct ComfyUI artifacts:

```text
kind = comfy_artifact
reference_number = next value from the same sequence
job_id = NULL
backend_job_id = Comfy Prompt ID
```

Direct ComfyUI runs do **not** become fake `media_jobs` rows. This preserves truthful lifecycle semantics.

The operator invariant is now:

```text
one number -> one media execution
```

Example allocation:

```text
51 -> Helix job
52 -> direct ComfyUI artifact
53 -> Telegram /t2v job
54 -> direct ComfyUI artifact
55 -> Telegram /t2i job
```

PostgreSQL sequence gaps are acceptable. References are unique/durable identifiers, not a gapless count of successful generations.

## Telegram reference behavior

Jobs remain a Helix lifecycle browser:

```text
/j
/j p <page>
```

Downloads remain a live completed-Comfy-artifact browser:

```text
/dl
/dl p <page>
```

Both now expose the same numeric media namespace.

For any registered artifact:

```text
/dl i 52
-> inspect media 52

/dl g 52
-> retrieve media 52

/jb 52
-> resolve the same media execution
```

For a real Helix job, `/jb` shows lifecycle/runtime/Production Profile/Outbox information.

For a direct ComfyUI artifact, `/jb` resolves the external media reference instead of returning `Job not found`, and points to the same inspect/get behavior used by Downloads.

Legacy Helix UUID/prefix input remains compatible. Legacy Comfy Prompt-prefix input remains accepted for compatibility, but discovered artifacts are presented with their durable numeric reference.

## Migration / validation state

Production database migration `0012_media_references.sql` has been applied successfully on the VPS.

Before applying it, a custom-format PostgreSQL backup was created:

```text
backups/helix-before-0012-20260826-094932.dump
```

Migration result:

```text
51 existing media_jobs
-> 51 media_references kind=job
```

No `comfy_artifact` rows existed immediately after migration, which is expected. Direct Comfy history entries allocate their reference when the updated runtime first discovers them.

The pulled runtime code passed the complete local test suite on the VPS host:

```text
32 tests
32 passed
0 failed
```

Regression coverage includes:

- Comfy-only numeric allocation;
- shared sequence behavior;
- `/dl` numeric list/inspect/get;
- `/jb` resolution of Comfy-only references;
- legacy Prompt-prefix input;
- numeric Prompt-prefix collision behavior.

The host currently runs Node 26 for manual npm commands and emits an engine warning because `@helix/media-runtime` declares Node `>=24 <25`. Tests still passed. The production container remains designed for Node 24.

### Deployment status

As of this checkpoint:

```text
GitHub main
-> updated

VPS working tree
-> pulled

npm test
-> 32/32 pass

PostgreSQL migration 0012
-> applied

running helix-runtime container
-> rebuild/restart still pending in this session
```

Therefore the database and code are ready, but the new Telegram numeric-reference behavior should not be described as live until the container is rebuilt/restarted and smoke-tested.

## Telegram operator checkpoint

Primary commands:

```text
/status             diagnostics
/queue              current Comfy + Helix queue state
/j                   Helix jobs, 20 per page
/j p <page>          another Jobs page
/jb <number>         job/media detail
/dl                  completed Comfy artifacts, 20 per page
/dl p <page>         another Downloads page
/dl i <number>       inspect artifact
/dl g <number>       retrieve artifact
/outbox              send work needing attention
/errors              recent failures
/ev <number>         durable Helix job event timeline
/t2v                 confirmed native LTX 2.5 generation
/t2i                 confirmed FLUX.2 Klein generation
/cc <number>         confirmed Helix job cancellation
/help                command list
```

Telegram remains a bounded operator surface, not a shell/control plane. Restart, package-update, arbitrary worker mutation and raw command execution remain outside its scope.

## Telegram forum and lifecycle checkpoint

`Absolute Cinema` is live through the existing single bot, one `helix-runtime`, one Comfy worker, and one GPU queue:

```text
forum chat: -1004369617758
Image topic: thread 5 -> /t2i
Video topic: thread 7 -> /t2v
```

Forum routing migration `0013_telegram_forum_topics.sql` is applied in production. The runtime validates configured routes, isolates prompt/reset state by `(chatId, threadId, userId)`, binds forum replies to the expected selective ForceReply message, persists Telegram delivery destinations, and returns completed media to the originating allowed topic. Private operator commands and T2V developer controls remain private-chat-only.

The lifecycle/progress implementation is merged into `main` at `cf07d25` and passed the combined VPS suite (`51/51`). It adds a durable confirmation-to-artifact lifecycle card, Comfy execution event correlation, throttled Workflow/Sampling progress, in-place retry/failure state, and same-message primary-document delivery. It is **not live** yet: migration `0014_telegram_job_lifecycle.sql` has not been applied and the production runtime has not been rebuilt/restarted with that code. See `TELEGRAM_LIFECYCLE_PROGRESS_IMPLEMENTATION.md` for the deployment gate and smoke-test criteria.

## T2V Production checkpoint

Christopher Nolan owns the validated `video.t2v` path.

Current semantic settings include:

```text
Core
asp   Aspect
qual  Quality
time  Duration
enh   Prompt Enhance

Advanced (-dev)
fps    FPS
seed   Stage 1 seed
seed2  Stage 2 seed
neg    Negative prompt
mp     Megapixel override
samp   Sampler
cfg    Guidance
```

Current default/test baseline:

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

Generation modes remain:

```text
Manual
Fast
Quality
```

Mode overlays never rewrite stored manual settings.

## T2I Production checkpoint

Annie Leibovitz owns the validated narrow `image.t2i` path using FLUX.2 Klein 4B Distilled FP8.

V1 deliberately exposes only:

```text
prompt
aspect
seed
```

The binder validates and changes only the vetted prompt/dimension/seed inputs. Images use the generic artifact path and Telegram `sendDocument` original-file delivery.

## Native LTX research checkpoint

Native LTX 2.5 remains the first-choice Production path for focused shots within its proven comfort zone.

Controlled work established that native LTX already handles meaningful temporal allocation, camera/action planning, hard cuts, subject continuity and joint audiovisual generation. Exact multi-object physical state, strict collision geometry, fragile possession chains and guaranteed final-state completion remain weaker.

Prompt Enhance has been evaluated and should generally remain **OFF** for already-directed Helix Production prompts. Its useful prompting principles should be internalized into Helix-side prompt compilation instead of allowing an enhancer to become a competing director.

Prompt Relay is validated as:

```text
temporal semantic routing / scene progression
```

not as a hard timestamp controller or persistent object-state machine.

## Reference-conditioning checkpoint

Licon MSR V1 for LTX 2.5 has now been installed and locally validated for an initial one-subject reference-driven generation.

The first local checkpoint supports treating it as a promising Production research control for reference identity/appearance, while stronger viewpoint retention, multi-subject slot separation, subject/object interaction and combined Relay+MSR behavior still require controlled validation.

The distinction remains:

```text
Prompt Relay
-> WHEN semantic beats should dominate

reference conditioning / MSR
-> WHO / WHAT should remain visually consistent
```

Do not collapse those two responsibilities into one Helix Director concept.

Research is recorded under:

```text
production/ltx-director/MSR_RESEARCH.md
production/ltx-director/REFERENCE_CONDITIONING_ALTERNATIVES.md
```

## Production workflow policy

Production should expose Helix semantics, not raw Comfy node IDs.

```text
creative / generation intent
        ↓
semantic Production settings
        ↓
optional tool-specific controls
        ↓
workflow binder / adapter
        ↓
ComfyUI
```

Tool-specific systems such as Prompt Relay, LTX Director and MSR stay inside Production. They are not the Helix Director contract.

## Reliability work still outstanding

The recent repository audit identified reliability work that should be handled deliberately rather than mixed into unrelated features:

- durable recovery for the submission window before `backend_job_id` is persisted;
- atomic API idempotency under concurrent duplicate requests;
- Helix-owned timeout semantics when backend cancellation/status is unavailable;
- service authentication before expanding runtime network trust;
- CI/integration-test enforcement;
- formal migration ledger/checksum governance;
- explicit at-least-once Telegram delivery semantics.

The current architecture should be preserved; these are hardening tasks, not reasons to rewrite Production.

## Preparation / architecture checklist

- [ ] Keep sanitized n8n exports as workflows stabilize.
- [ ] Define common IDs and object names across system divisions.
- [ ] Define executable/versioned shared contracts for Intelligence/Director/Experiment/Production objects.
- [ ] Define evidence/provenance requirements for Intelligence research.
- [x] Establish durable Production state outside n8n.
- [x] Validate native LTX 2.5 I2V/T2V generation.
- [x] Pin the standalone ComfyUI/custom-node execution stack.
- [x] Submit, track, reconcile and deliver real generation through `helix-runtime`.
- [x] Add Telegram diagnostics/queue/job/outbox/error/event views.
- [x] Add durable operational alerts and safe cancellation.
- [x] Add durable T2V/T2I pre-submit confirmation.
- [x] Implement Core/Advanced T2V settings.
- [x] Implement Manual/Fast/Quality generation modes.
- [x] Add profile-aware Annie Leibovitz T2I generation.
- [x] Add durable numeric Job numbers without changing internal Helix/Comfy IDs.
- [x] Add one shared numeric media-reference namespace for Helix and direct Comfy artifacts.
- [x] Add 20-item Jobs and Downloads pagination.
- [x] Run controlled Prompt Enhance evaluation.
- [x] Validate Prompt Relay for temporal semantic routing.
- [x] Complete first one-subject Licon MSR local validation.
- [ ] Validate stronger MSR viewpoint/identity retention.
- [ ] Validate multi-subject MSR separation.
- [ ] Validate/calibrate Fast and Quality with controlled benchmarks.
- [ ] Validate real Windows reboot/AtStartup behavior.
- [ ] Close Production reliability items from the repository audit.

## Next Helix brain phase

**Niche Intelligence design** remains the next main brain phase.

The intended research direction is platform-first rather than generic-web-search-first. YouTube/Facebook/Reels-style observations should provide primary behavioral evidence; wider web research supplements those observations.

Niche Intelligence should eventually define:

```text
Niche
EvidenceRef
observed content features
trend / saturation / novelty signals
observed facts vs inferred patterns
NicheModel
```

The later Director should consume that model without knowing whether Production currently uses LTX, FLUX, another local model, a provider API, stock footage, motion graphics, or human editing.
