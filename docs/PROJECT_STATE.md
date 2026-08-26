# Project State

## Current phase

**Preparation / foundation, with a validated Production execution slice, proven native LTX 2.5 T2V and FLUX.2 Klein T2I paths, controlled native T2V quality findings, completed Prompt Enhance and Prompt Relay research checkpoints, persisted semantic T2V/T2I settings, numeric Job references, and an explicit T2V generation Mode layer.**

The high-level Helix system division is established. Production execution is hardened enough to operate as a stable checkpoint while generation research continues independently and the project advances the main Helix brain path.

## Primary system direction

```text
Niche Intelligence -> Director -> Experiment Engine
```

Production/generation remains a separate workstream connected later through stable creative/variant briefs. Generation technology must not shape the Intelligence or Helix Director contracts.

The current Production direction is **open/self-hosted first**. Runway is not part of the active plan. Seedance 2.0 remains a behavioral/quality reference rather than an active provider dependency.

## Active Production checkpoint

Current status as of 2026-08-26:

```text
caller / n8n / Telegram
    ↓
helix-runtime :8787
    ├── helix-db
    ├── TelegramCommandService
    ├── TelegramAlertService
    ├── TelegramCancelService
    ├── TelegramT2VService + settings / mode / reset
    ├── TelegramT2IService + settings / reset
    ├── TelegramDownloadsService
    └── OutboxRepository
    ↓
ComfyAdapter / ComfyClient
    ↓ Tailscale
helix-rtx4060-01
    ↓
ComfyUI :8188
    ↓
generated artifact
    ↓
VPS temporary spool
    ↓
Telegram original document + caption
```

Current worker facts:

```text
durable worker ID: helix-rtx4060-01
physical-worker name: Helix RTX 4060
Production profiles: Christopher Nolan / Annie Leibovitz
ComfyUI: 0.33.0
Comfy revision: 7dde56176efa71fd74ef7b3930ab5882d1926288
Python: 3.12.11
PyTorch: 2.10.0+cu130
GPU: RTX 4060
validated tools: video.i2v, video.t2v, image.t2i
max GPU jobs: 1
```

The active standalone ComfyUI installation is currently rooted at:

```text
C:\AI\ComfyUI-CLI
```

Heavy model assets are consolidated under:

```text
C:\AI\Models\LTX
C:\AI\Models\WAN
C:\AI\Models\FLUX
```

and exposed through the standalone runtime's `extra_model_paths.yaml`.

The VPS-side runtime supports durable numbered media jobs, restart recovery, artifact discovery/retrieval, a paginated live Downloads browser, bounded Telegram delivery, diagnostics, alerts, cancellation, confirmed T2V/T2I prompt capture, persisted settings, durable reset confirmation, and selected T2V generation modes.

## Telegram operator checkpoint

Top-level commands remain:

```text
/status             diagnostics
/queue              current Comfy + Helix queue state
/j                   20 recent jobs per page
/j p <page>          another Jobs page
/jb <number>         one job plus Outbox/send state
/dl                  recent live Comfy artifacts
/dl p <page>         another Downloads page
/dl i <number>       inspect a job artifact
/dl g <number>       retrieve a job artifact
/outbox              send work still needing attention
/errors              recent failures
/ev <number>         complete durable event timeline
/t2v                 confirmed native LTX 2.5 generation
/t2i                 confirmed FLUX.2 Klein image generation
/cc <number>         confirmed job cancellation
/help                command list
```

T2V subcommands now include:

```text
/t2v settings
/t2v settings -dev
/t2v set ...
/t2v set -dev ...
/t2v reset
/t2v reset -dev
/t2v mode
/t2v m
/t2v mode manual
/t2v mode fast
/t2v mode quality
/t2v mode reset
```

The service accepts messages only from the configured Telegram chat ID and does not expose shell/package/worker mutation operations.

Every media job retains its internal Helix ID and Comfy Prompt ID while exposing one durable sequential `BIGINT` Job number to the operator. Migration `0011_job_numbers.sql` backfilled existing jobs chronologically as `1–51`; later jobs use the same sequence. Numeric lookup is exact. Legacy Helix UUID/prefix lookup remains compatible, and Downloads still accepts Comfy Prompt prefixes for unmapped history entries.

Jobs and Downloads each show 20 items per page. Jobs use `/j p <page>` and Downloads use `/dl p <page>`; both expose compact previous/next commands.

## Confirmed T2V input

`/t2v` separates prompt entry from GPU execution:

```text
/t2v
  ↓
awaiting_prompt
  ↓
prompt preview + effective settings snapshot
  ↓
awaiting_confirmation
  ↓ yes
video.t2v
```

Pending T2V state is durable in `operator_pending_t2v`. No media job exists until `yes` is confirmed. The snapshot freezes the effective generation settings so later settings/mode changes cannot silently alter a generation already shown to the operator.

## T2V settings checkpoint

The stable semantic T2V settings surface is implemented for:

```text
Christopher Nolan
└── video.t2v
```

Core:

```text
asp   Aspect
qual  Quality
time  Duration
enh   Prompt Enhance
```

Advanced settings require explicit `-dev`:

```text
fps    FPS
seed   Stage 1 seed
seed2  Stage 2 seed
neg    Negative prompt
mp     Megapixel override
samp   Sampler
cfg    Guidance
```

`-dev` is a superset authority and can also inspect/change Core controls. There is no persistent Dev toggle.

Exact default/test baseline:

```text
Aspect       16:9
Quality      Standard -> 0.9 MP effective
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

The current workflow resolves this baseline to `1280x704` because dimensions are snapped to its internal multiple-of-32 requirement.

Migration `0007_t2v_profile_settings.sql` persists base settings. Workflow/template internals such as models, sigmas, decode tiling and bit depth remain outside the operator settings contract.

## Reset checkpoint

```text
/t2v reset
→ reset Core base settings only

/t2v reset -dev
→ reset all exposed base settings
```

Reset requires durable `yes/no` confirmation and shows only values that will actually change. Migration `0008_t2v_reset_confirmations.sql` persists reset intent/snapshots.

Reset does not alter the selected generation Mode.

## Generation Mode checkpoint

The operator concept is **Mode**, not Profile.

Christopher Nolan remains the Production profile/authority. Generation behavior uses one of three explicit Modes:

```text
Manual
Fast
Quality
```

There is no Auto mode.

Resolution order:

```text
stored manual settings
        ↓
selected Mode overlay
        ↓
effective settings snapshot
        ↓
workflow binder
        ↓
ComfyUI
```

Mode selection never rewrites stored manual settings. Switching back to Manual restores the operator's exact stored settings.

Current v1 definitions:

```text
Manual
  no overlay

Fast
  Quality   Standard / 0.9 MP
  Duration  5 s
  FPS       24
  MP        quality-derived

Quality
  Quality   High / 1.2 MP
  Duration  8 s
  FPS       24
  MP        quality-derived
```

Aspect, seeds, negative prompt, sampler, guidance and Prompt Enhance remain inherited from the stored manual settings.

`/t2v mode reset` selects Manual. Settings reset and Mode reset remain separate operations.

Migration `0009_t2v_generation_modes.sql` persists the selected Mode.

## Native LTX 2.5 T2V research checkpoint

Controlled native benchmarking covers:

```text
5 s  -> 121 frames @ 24 fps -> ~5.04 s
8 s  -> 193 frames @ 24 fps -> ~8.04 s
10 s -> 241 frames @ 24 fps -> ~10.04 s
native output: 1280x704
```

Key findings:

- native LTX already performs meaningful semantic temporal allocation, camera/action planning, native hard cuts and joint AV generation;
- continuous vehicle/camera shots, motorcycle POV, focused human acting and performance/music scenes are strong native territory;
- exact collision geometry, strict multi-object physical causality, exact reflection geometry, dense low-level sub-action tracking and guaranteed final-state completion remain unreliable;
- 5 seconds remains the exact default/test baseline and a useful compact/high-motion duration;
- 8 seconds currently gives the strongest balance for richer native single-shot research;
- 10 seconds should be used only when the scene genuinely contains enough evolving action;
- longer duration can produce temporal dilation rather than more completed events;
- natural overlapping causal language often produces better acting than rigid state-machine sequencing;
- adherence and finished-video quality must be evaluated separately;
- subtle ambience is less reliable than dominant sound sources;
- multishot prompts work better when each shot has a distinct job.

Full findings are recorded in `production/ltx-director/NATIVE_T2V.md`.

Model-quality evaluation should use the native Comfy artifact or a verified original-file document path.

## Prompt Enhance research checkpoint

Prompt Enhance has been evaluated as a controlled preprocessing layer.

Working conclusion:

```text
simple / under-specified user prompt
-> Prompt Enhance can improve framing, POV interpretation and acting readability

already well-directed Helix Production prompt
-> Prompt Enhance can become a competing second director
```

For polished prompts it can over-direct camera behavior, compress/reweight chronology and still fail to repair low-level state or subtle ambience. The preferred Helix direction is therefore to internalize the useful enhancer prompting principles in the Helix-side prompt compiler while keeping **Prompt Enhance OFF** for final well-directed Production captions unless an explicit simple-input path is being tested.

## Prompt Relay research checkpoint

Kijai `ComfyUI-PromptRelay` is now installed and locally validated against native LTX 2.5 T2V.

The decisive abstraction is:

```text
Prompt Relay
= temporal semantic routing / scene progression

not
= hard timestamp switch
= persistent object-state machine
```

Clean controlled A/B findings include:

- motorcycle upright -> lean -> recover: native already strong; Relay reduced second-region leakage modestly;
- walk -> stop/speak -> run: Relay concentrated the middle event and gave the final run region earlier/clearer semantic ownership;
- receive -> inspect/open -> discard: Relay did not solve fragile possession/object-state continuity and failed to complete the final discard in the tested short region;
- 15-second cafe narrative: native introduced the later man/approach beats very early, while Relay substantially preserved a longer opening wait and reduced future-event leakage while maintaining strong long-shot coherence.

Current role:

```text
simple focused shot
-> native LTX first

one generation with distinct narrative / behavioral beats
-> Prompt Relay is a validated option

strict physical-state causality
-> Relay alone is insufficient
```

Full findings are recorded in `production/ltx-director/PROMPT_RELAY.md`.

## Licon MSR research checkpoint

Licon MSR V1 for LTX 2.5 is the next independent control experiment.

It is **researched but not yet locally validated**.

The published system uses a dedicated multi-reference LoRA, learned reference-slot embeddings and distinct negative temporal positions so LTX can retrieve character/clothing/object/background reference details through its native attention path. The current standalone plugin supports up to five references and documents a two-stage integration that re-applies MSR references after spatial latent upscaling.

Target capability:

```text
Prompt Relay
-> WHEN semantic beats dominate

Licon MSR
-> WHO / WHAT referenced entities should remain visually consistent
```

Test order is one reference subject -> two-subject slot separation -> subject + object. Do not combine MSR with Prompt Relay until MSR is independently validated.

Research and the local test plan are recorded in `production/ltx-director/MSR_RESEARCH.md`.

## Production workflow policy

The runtime has a narrow semantic contract but must not become a raw mirror of the Comfy graph.

```text
vetted Comfy API workflow
        ↓
stored semantic settings
        ↓
optional Mode overlay
        ↓
effective settings snapshot
        ↓
workflow binder
        ↓
helix-runtime execution
```

Native LTX remains the first Production path for shots within its proven comfort zone.

Prompt Relay is now justified specifically for distinct semantic/narrative beats and scene progression where native LTX leaks later concepts across the timeline. It should not be used as a substitute for object-state or physics control.

MSR remains an opt-in research candidate for reference-critical entities and must earn its role independently.

## Next Production phases

### 1. Validate / calibrate Manual, Fast and Quality

Use fixed prompts/seeds and native artifacts. Measure runtime, finished-video quality, motion/coherence, prompt adherence, action completion and audio behavior.

### 2. Licon MSR independent validation

Install the dedicated LTX 2.5 MSR plugin and V1 LoRA, then run one-subject identity, two-subject separation and subject/object reference tests before combining it with temporal controls.

### 3. Prompt compiler design

Translate the Prompt Enhance and Prompt Relay findings into a Helix-owned Production prompt compiler:

```text
persistent world / continuity state
+ focused audiovisual scene caption
+ optional temporal beats
+ optional reference entities
```

Keep backend frame counts, masks, slot IDs and node wiring inside Production adapters.

### 4. Combined-control experiments only after independent validation

If MSR works independently, test:

```text
MSR references
+ Prompt Relay scene progression
```

with one change at a time and explicit attribution.

### 5. Production contract freeze

When native T2V, Mode behavior and targeted control layers are understood:

- freeze/version the stable workflow family;
- document semantic bindings/defaults;
- expose the same Production contract to Telegram, n8n and later Helix Director callers;
- keep node IDs/backend details behind the Production binder/adapter.

There is intentionally no Auto phase.

## Preparation checklist

- [ ] Keep sanitized n8n exports as workflows stabilize.
- [ ] Define common IDs and object names across system divisions.
- [ ] Define draft shared contracts for Intelligence/Director/Experiment/Production objects.
- [ ] Define evidence/provenance requirements for Intelligence research.
- [x] Establish durable Production state outside n8n.
- [x] Validate native LTX 2.5 I2V/T2V generation.
- [x] Pin the standalone ComfyUI/custom-node execution stack.
- [x] Submit, track, recover and deliver real generation through `helix-runtime`.
- [x] Add Telegram diagnostics/queue/job/outbox/error/event views.
- [x] Add durable operational alerts and safe cancellation.
- [x] Add durable T2V pre-submit confirmation.
- [x] Establish native 5/8/10-second T2V findings.
- [x] Implement Core/Advanced T2V settings.
- [x] Implement durable Core/full T2V reset.
- [x] Implement explicit Manual/Fast/Quality generation Modes.
- [x] Add profile-aware Annie Leibovitz T2I settings, confirmation, binding, generation, and original-file delivery.
- [x] Add durable numeric Job references without changing internal Helix/Comfy IDs.
- [x] Add 20-item Jobs and live Downloads pagination.
- [ ] Validate/calibrate Fast and Quality with controlled benchmarks.
- [x] Run controlled Prompt Enhance ON/OFF evaluation.
- [x] Validate Prompt Relay for temporal semantic routing / scene progression.
- [ ] Validate Licon MSR independently for reference identity/continuity.
- [ ] Validate real Windows reboot/AtStartup behavior for the ComfyUI worker.

## Next Helix brain phase

**Niche Intelligence design.**

Production remains a parallel execution/research track. The brain phase should define what a `Niche` means, what platform evidence is persisted, how content features and trends are represented, how observed facts differ from inferred patterns, what a `NicheModel` contains, and how the Director consumes that model.

The intended research direction is platform-first rather than web-search-first: YouTube/Facebook/Reels-style data should provide primary behavioral evidence while broader web research supplements rather than replaces platform observations.

## Production profile / T2I architecture foundation

`helix-rtx4060-01` remains the one physical RTX 4060 worker, Comfy endpoint,
adapter, and queue, with maximum concurrent GPU jobs fixed at one. `nolan`
(Christopher Nolan) is its validated LTX `video.t2v` / `video.i2v` Production
Profile. `leibovitz` (Annie Leibovitz) is a second logical Production Profile
for `image.t2i`, not a second worker. FLUX.2 Klein 4B Distilled FP8 is
validated through successful RTX 4060 Telegram generations and original-file
deliveries. The runtime has
profile-aware job identity and a durable `/t2i` confirmation flow for the
supplied Distilled API workflow. `HELIX_T2I_WORKFLOW_PATH` defaults to
`/app/workflows/image_flux2_klein_4b_distilled_fp8_t2i_v2.api.json`; migration
`0010` is applied. V1 exposes only aspect/seed and binds only prompt, width,
height, and concrete seed; Base/modes remain deferred.
