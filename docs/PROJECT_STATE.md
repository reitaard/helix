# Project State

Last documentation reconciliation: **2026-09-01**.

## Current phase

Helix remains in **Preparation / foundation**, with a mature single-worker Production execution slice and active Production research. The main brain-development order remains:

```text
Niche Intelligence -> Director -> Experiment Engine
```

Production/generation remains a separate workstream. It must expose stable semantic contracts upward rather than shaping Intelligence or Helix Director around ComfyUI, LTX, FLUX, or any other backend.

The current generation direction remains **open/self-hosted first**. Runway is not part of the active Production plan. Seedance-class systems are behavioral/quality references where useful.

## Active Production architecture

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ├── helix-db
    │   ├── workers + observations
    │   ├── media_jobs
    │   ├── media_references
    │   ├── media_job_events
    │   ├── media_deliveries
    │   ├── operator / Telegram state
    │   └── Production profile/settings state
    │
    ├── JobService / WorkerService
    ├── Telegram operator + generation services
    ├── DeliveryWorker
    └── Comfy adapter boundary
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
```

Current worker facts:

```text
durable worker ID: helix-rtx4060-01
physical worker: Helix RTX 4060
GPU: RTX 4060
ComfyUI: 0.33.0
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
Python: 3.12.11
PyTorch: 2.10.0+cu130
physical GPU concurrency: 1
```

Logical Production Profiles share that one worker:

```text
nolan / Christopher Nolan
-> video.i2v
-> video.t2v

leibovitz / Annie Leibovitz
-> image.t2i
```

Profiles describe tool authority and operator presentation, not additional hardware or queues.

## Operator media identity

Helix keeps internal, operator-facing, and backend identities separate:

```text
internal Helix job ID      job_...
operator media reference  52
Comfy execution ID         prompt_id
```

Migrations `0011_job_numbers.sql` and `0012_media_references.sql` established one durable numeric media-reference namespace shared by Helix jobs and direct/manual ComfyUI artifacts.

The invariant is:

```text
one number -> one media execution
```

Direct ComfyUI generations do not become fake `media_jobs` rows. They receive `media_references.kind = comfy_artifact` mappings to their Comfy Prompt IDs.

Jobs and Downloads therefore converge on the same operator identity:

```text
/jb 52
/dl i 52
/dl g 52
```

Legacy Helix IDs and legacy Comfy Prompt-prefix input remain compatibility paths where supported.

## Telegram checkpoint

Telegram remains a bounded operator/generation surface, not a shell or general control plane.

Private operator capabilities include diagnostics, queue/job/download inspection, failures/events/outbox, guarded cancellation, T2V/T2I generation, settings, and explicit developer controls.

The repository also contains forum-topic routing for the `Absolute Cinema` generation forum:

```text
Image topic -> image.t2i
Video topic -> video.t2v
```

Forum interaction is isolated by `(chatId, threadId, userId)`, uses selective ForceReply only for bare prompt capture, and uses inline Generate/Cancel or Reset/Cancel confirmation buttons. Consumed ForceReply cards are removed after prompt capture so they cannot become active again when the user changes topics. Operator-only commands and T2V developer controls remain private-chat-only.

### Lifecycle/progress deployment status

The repository contains the newer lifecycle/progress implementation:

- persistent Comfy execution WebSocket telemetry with a stable Helix client identity;
- normalized execution/progress events;
- compact Workflow + Sampling presentation;
- durable Telegram lifecycle-message ownership;
- primary artifact replacement through `editMessageMedia`;
- delivery retry/failure presentation on the same lifecycle message.

Migration `0014_telegram_job_lifecycle.sql` exists in the repository.

**The exact live VPS checkpoint is intentionally not asserted here until it is re-verified.** The last documentation checkpoint proved forum migration `0013` deployed, while later lifecycle/forum code continued changing. Verify the production database for `telegram_job_lifecycles` and the running container for lifecycle/progress code before saying `0014` is live.

See:

- `docs/TELEGRAM_DESIGN.md`
- `docs/TELEGRAM_FORUM_IMPLEMENTATION_PLAN.md`
- `docs/TELEGRAM_LIFECYCLE_PROGRESS_IMPLEMENTATION.md`

## T2V Production checkpoint

Christopher Nolan owns the validated native LTX 2.5 `video.t2v` path.

Persisted semantic settings include:

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

Generation modes are:

```text
Manual
Fast
Quality
```

Mode overlays never rewrite stored manual settings.

Prompt Enhance has already been evaluated. For already-directed Helix Production prompts it should generally remain **OFF**; useful enhancement principles belong in Helix-side prompt compilation rather than a competing automatic director.

Prompt Relay has also been validated. Its useful abstraction is:

```text
temporal semantic routing / scene progression
```

not hard timestamps, physics control, or persistent object-state tracking.

## T2I Production checkpoint

Annie Leibovitz owns the narrow `image.t2i` path.

The current runtime wiring targets **FLUX.2 Klein 4B INT8 W8A8** as the active workflow candidate. The prior Distilled FP8 workflow remains installed as a rollback path and was itself validated earlier.

V1 deliberately exposes only:

```text
prompt
aspect
seed
```

The workflow binder mutates only vetted prompt, width, height, and seed inputs. Model switching and T2I generation modes remain deferred.

## LTX Production research checkpoint

Native LTX 2.5 remains the first Production choice for focused shots inside its proven comfort zone.

Controlled work has established:

- native 5 s / 8 s / 10 s T2V behavior;
- meaningful temporal allocation and camera/action planning;
- native hard cuts and joint audiovisual generation;
- Prompt Relay scene-progression value;
- full-resolution native I2V as an identity/detail candidate;
- CGlide and Lightricks long-video continuation baselines;
- tool-specific controls must stay inside Production rather than becoming Helix Director concepts.

Exact multi-object physical state, strict collision geometry, fragile possession chains, and guaranteed final-state completion remain weaker classes.

## Reference-conditioning checkpoint

Reference conditioning is no longer a purely future capability.

### Licon MSR

A first one-subject LTX 2.5 MSR generation passed locally: the reference person's recognizable identity/appearance survived while composition changed substantially into a new scene.

Still pending:

- stronger viewpoint identity testing;
- multi-subject slot separation;
- person + product + background interaction;
- combined timing/reference behavior.

### Lightricks Ingredients

Lightricks Ingredients Core IC-LoRA has also produced a real local new-scene reconstruction on the LTX 2.3 stack using person + product + location references. The cheap 8-step path proved the mechanism, not the final quality ceiling.

Still pending:

- higher-quality 30-step / CFG / STG validation;
- controlled comparison against Licon on matched reference tasks.

The responsibility split remains:

```text
Prompt Relay
-> WHEN semantic beats should dominate

reference conditioning
-> WHO / WHAT should remain visually consistent
```

Do not collapse these into one control concept.

See `production/ltx-director/README.md` and its linked research notes.

## Speech checkpoint

`services/speech/` contains the project-owned local speech foundation.

Moonshine Voice `0.1.5` with the Medium Streaming English model is validated on the VPS CPU through the project-owned transcription harness. The production installation lives outside the repository at `/opt/helix-speech`.

There is **no production speech daemon, HTTP endpoint, or Telegram voice-note integration yet**. Future voice input should transcribe to text and then enter the existing media-runtime command/pending-state paths rather than creating a second command interpreter.

## Tiny-LLM checkpoint

`research/helix-ai-adapter/` remains detached research. Qwen3 0.6B Q8_0 and related benchmark cases are being evaluated for bounded semantic tasks, but no tiny model is integrated into Telegram, the database, workflow mutation, or job execution.

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

Prompt Relay, LTX Director, MSR, Ingredients, samplers, node IDs, and model-specific graph state remain Production implementation details unless repeated experiments prove that a higher-level concept belongs in a stable cross-system contract.

## Reliability work still outstanding

- durable recovery for the submission window before `backend_job_id` is persisted;
- atomic API idempotency under concurrent duplicate requests;
- Helix-owned timeout semantics when backend cancellation/status is unavailable;
- service authentication before expanding runtime network trust;
- CI/integration-test enforcement;
- formal migration ledger/checksum governance;
- explicit at-least-once Telegram delivery semantics;
- real Windows reboot / AtStartup validation;
- worker output-retention cleanup;
- image upload/staging for broader I2V flows.

These are hardening tasks, not reasons to rewrite the current Production boundary.

## Preparation checklist

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
- [x] Add one shared numeric media-reference namespace for Helix and direct Comfy artifacts.
- [x] Add 20-item Jobs and Downloads pagination.
- [x] Evaluate Prompt Enhance.
- [x] Validate Prompt Relay for temporal semantic routing.
- [x] Validate first one-subject Licon MSR generation.
- [x] Validate Ingredients Core IC-LoRA multi-asset reconstruction mechanism.
- [ ] Validate stronger MSR viewpoint/identity retention.
- [ ] Validate multi-subject MSR separation.
- [ ] Validate higher-quality Ingredients settings.
- [ ] Validate/calibrate Fast and Quality modes with controlled benchmarks.
- [ ] Verify the current live Telegram lifecycle migration/runtime checkpoint.
- [ ] Validate real Windows reboot/AtStartup behavior.
- [ ] Close Production reliability items from the repository audit.

## Next Helix brain phase

**Niche Intelligence design** remains the next main brain phase.

The intended research direction is platform-first rather than generic-web-search-first. YouTube/Facebook/Reels-style observations should provide primary behavioral evidence; wider web research should supplement those observations.

Niche Intelligence should eventually define concepts such as:

```text
Niche
EvidenceRef
observed content features
trend / saturation / novelty signals
observed facts vs inferred patterns
NicheModel
```

Later Helix Director logic should consume that model without knowing whether Production currently uses LTX, FLUX, another local model, a provider API, stock footage, motion graphics, or human editing.
