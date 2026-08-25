# Production

Production is the execution layer. This area contains the active ComfyUI worker/runtime work as well as model/workflow experiments.

The current generation direction is **open/self-hosted first**. Runway is not part of the active Production plan. Seedance 2.0 is currently used as a behavioral/quality reference for understanding packaged video-model prompting and temporal behavior rather than as an integrated provider.

## Current execution path

```text
n8n / caller / Telegram
    ↓
helix-runtime
    ├── helix-db + worker/job/delivery/operator state
    ├── TelegramCommandService
    ├── TelegramAlertService
    ├── TelegramCancelService
    ├── TelegramT2VService
    ├── T2V settings + reset services
    ├── OutboxRepository
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
Telegram original-file delivery
```

The durable worker ID is `helix-rtx4060-01`; the human-facing display name is `Christopher Nolan`. The current Comfy revision is pinned at `7dde56176efa71fd74ef7b3930ab5882d1926288`.

Validated media capabilities:

```text
video.i2v
video.t2v
```

The runtime supports durable job acceptance, raw Comfy workflow submission, backend `prompt_id` persistence, reconciliation/restart recovery, artifact capture, original-file Telegram delivery, bounded delivery retry, cancellation, timeout, operational alerts, complete event debugging, live worker diagnostics, T2V confirmation, persisted T2V settings, and durable T2V reset confirmation.

## Native T2V research checkpoint

Native T2V was tested deliberately before making Director/Prompt Relay part of the default path.

Controlled native runs cover:

```text
5 s  -> 121 frames @ 24 fps -> ~5.04 s
8 s  -> 193 frames @ 24 fps -> ~8.04 s
10 s -> 241 frames @ 24 fps -> ~10.04 s
native output: 1280x704 on the 16:9 / 0.9 MP baseline
Prompt Enhance OFF for the controlled native baseline
```

Current conclusions:

- native LTX already provides meaningful temporal allocation, camera/action planning, native hard cuts and joint AV behavior;
- focused continuous shots should try native LTX first;
- 8 seconds is the current research sweet spot for richer native single shots, while 5 seconds remains the exact default/test baseline;
- 10 seconds should be used only when the scene genuinely contains enough evolving action;
- exact collision geometry, dense physical causality, precise optical/reflection geometry and strict multi-action tracking remain weak;
- longer duration can stretch a story instead of completing more events;
- natural overlapping action language generally works better than rigid state-machine phrasing;
- prompt adherence and finished-video quality must be evaluated separately;
- dominant sound sources are more reliable than subtle ambient beds.

The quality-oriented 8-second batch showed strong native results for sports-car tracking, singer/performance footage, human acting/dialogue and motorcycle POV. Multishot visuals are promising, but shot responsibilities and audio continuity still need more control/testing.

See [`production/ltx-director/NATIVE_T2V.md`](ltx-director/NATIVE_T2V.md) for the full findings and current prompt/control policy.

## T2V semantic settings checkpoint

T2V is no longer a prompt-only runtime surface.

The persisted Production profile/tool pair is:

```text
Christopher Nolan
└── video.t2v
```

The settings contract is intentionally semantic rather than a raw mirror of every Comfy node.

### Core authority

```text
asp   Aspect
qual  Quality
 time Duration
enh   Prompt Enhance
```

Core is available without elevated syntax.

### Advanced authority

Explicit `-dev` is required for Advanced controls:

```text
fps    FPS
seed   Stage 1 seed
seed2  Stage 2 seed
neg    Negative prompt
mp     Megapixel override
samp   Sampler
cfg    Guidance
```

`-dev` is a superset authority, so it can also inspect/change Core controls. There is no persistent Dev toggle or hidden elevated session state.

Current exact default baseline:

```text
Aspect       16:9
Quality      Standard -> effective 0.9 MP
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

The native baseline resolves to `1280x704`, not a hard-coded `1280x720`, because the workflow resolution selector combines aspect, megapixels and its internal multiple-of-32 snapping.

Settings are persisted in PostgreSQL by migration `0007_t2v_profile_settings.sql` and are bound into the vetted LTX T2V workflow at submission time. The generation confirmation captures the resolved settings snapshot so the job executes the values that were actually confirmed.

### Telegram settings surface

Current operator patterns include:

```text
/t2v settings
/t2v settings -dev
/t2v set <setting>
/t2v set <setting> <value>
/t2v set -dev <setting>
/t2v set -dev <setting> <value>
```

Advanced settings requested without `-dev` return only `Dev access required.`

Successful changes use compact one-line acknowledgements such as:

```text
[ FPS : 30 ]
[ Duration : (8)s ]
[ Aspect : ⦗1:1⦘ (Square) ]
```

## T2V reset checkpoint

Reset is durable and confirmation-gated.

```text
/t2v reset
→ reset Core settings only

/t2v reset -dev
→ reset the full exposed T2V profile
```

Only settings that would actually change are shown in the confirmation preview. Nothing mutates until `yes` is received.

The full reset restores the exact exposed baseline listed above, including the default negative prompt, both seeds, sampler and guidance. It does **not** rewrite workflow plumbing such as model files, sigmas, tiled decode parameters, bit depth or internal node topology.

Reset confirmation state is persisted by migration `0008_t2v_reset_confirmations.sql`, expires after the confirmation window, survives runtime restart until expiry, and snapshots the intended target state.

## Workflow integration policy

Do not make every internal graph value a public Helix setting.

```text
vetted Comfy API workflow
        ↓
semantic Production settings
        ↓
workflow binder
        ↓
helix-runtime execution
```

Workflow/template plumbing remains separate from profile settings. Models, sigmas, decoder tiling, internal graph topology and similar backend details are maintained as workflow/template state rather than resettable Telegram controls.

Native LTX remains the first Production path for shots inside its proven comfort zone. Director/Prompt Relay should be introduced when a required beat, state change, shot responsibility, or timing relationship repeatedly fails under focused native prompting.

## Generation modes / presets — next Production layer

There is currently **no named generation mode system** such as `fast`, `quality`, `balanced` or `auto`.

The current source of truth remains the persisted T2V settings profile. A future mode is a named, versionable policy that resolves to settings; it is not a replacement for the profile and should not be confused with the `Christopher Nolan` Production profile identity.

Planned structure:

```text
Christopher Nolan / video.t2v
        ↓
optional generation mode
        ↓
resolved semantic settings
        ↓
workflow binder
        ↓
ComfyUI
```

Candidate names such as `fast`, `quality` and `auto` are placeholders until benchmarked. Their actual values must come from measured runtime/quality tradeoffs rather than assumptions.

Manual/custom operation must remain available even after modes exist.

## Planned Production phases

### Phase 1 — generation mode contract

Define the mode object and precedence rules before adding commands.

Decide:

- whether a mode applies a complete settings bundle or a controlled subset;
- how explicit user overrides interact with a selected mode;
- whether a mode is persisted or selected per generation;
- how the confirmation view shows the selected mode and resolved settings;
- how reset returns to the baseline/manual state;
- how mode versions are recorded for reproducible experiments.

Do not lock `fast`/`quality` values yet.

### Phase 2 — controlled mode calibration

Run a small benchmark matrix using fixed prompts/seeds and native artifacts.

Measure at minimum:

```text
runtime
output quality
motion/coherence
prompt adherence
audio behavior
completion of intended action
```

Use the existing 5/8/10-second findings as evidence, but do not equate longer duration with higher quality automatically.

### Phase 3 — explicit named modes

After calibration, add the smallest useful set of named modes. Likely categories to evaluate are:

```text
baseline/default
fast
quality
```

Only keep modes that demonstrate a meaningful and repeatable tradeoff.

### Phase 4 — auto resolver

`auto` should be a policy layer, not a magic graph setting.

Initially it can be deterministic: choose a proven mode/settings bundle from scene requirements such as action density, desired duration, shot complexity and quality priority. An AI semantic adapter can be added later without giving it direct workflow mutation authority.

### Phase 5 — Prompt Enhance A/B

Run controlled Prompt Enhance OFF/ON tests against the now-stable settings/mode layer. Preserve the raw input prompt and the exact resolved generation settings for comparison.

### Phase 6 — targeted Director / Prompt Relay retest

Re-test Director/Prompt Relay only on native weaknesses that still matter after settings/mode calibration: strict beat timing, shot responsibility, persistent state change, structured multi-shot progression and other proven failure classes.

### Phase 7 — Production contract freeze

Once native T2V + modes + targeted control layers are understood:

- freeze/version the stable workflow family;
- document semantic bindings and defaults;
- expose the same Production contract to Telegram, n8n and later Helix Director callers;
- keep backend-specific node IDs behind the binder/adapter boundary.

## Runtime ownership

The runtime owns:

- worker identity, durable ID, presentation name, and health;
- durable job IDs/state/events;
- Comfy submission and backend job ID persistence;
- execution reconciliation and restart recovery;
- prompt-specific cancellation and running-job timeout;
- generated artifact metadata and retrieval;
- temporary spooling and media probing;
- durable Telegram delivery state;
- bounded retry/backoff and terminal delivery failures;
- Telegram diagnostics, inspection, alerts, debug views, confirmed cancellation and confirmed T2V submission;
- persisted T2V profile settings and reset confirmation;
- live Comfy/Python/Torch/GPU/VRAM/RAM diagnostics;
- read-only comparison of the pinned Comfy revision with upstream `master`.

ComfyUI owns workflow graph execution, model/custom-node execution, worker-local input/output files, native queue/history/WebSocket execution state, and live `/system_stats` data.

## Current checkpoint

Completed:

- durable asynchronous submission and restart recovery;
- artifact capture/retrieval;
- original-file Telegram delivery and bounded retry;
- cancellation and running timeout;
- race-safe terminal job states;
- human-friendly worker presentation name;
- `/status`, `/queue`, `/jobs`, `/job`, `/outbox`, `/errors`, `/events`, `/t2v`, `/cancel`, `/help`;
- durable operational alerts and deduplication;
- durable cancellation confirmation;
- durable T2V prompt/confirmation state;
- persisted Core/Advanced T2V settings;
- durable Core/full T2V reset confirmation;
- validated native `video.t2v` generation and Telegram delivery;
- controlled 5/8/10-second native T2V research baseline;
- tool-aware Telegram artifact captions;
- advisory WebSocket-event readiness semantics;
- read-only pinned-revision/upstream Comfy update awareness.

Still deferred or pending:

- named generation modes/presets;
- controlled Prompt Enhance ON/OFF evaluation;
- targeted LTX Director / Prompt Relay retest;
- worker output-retention cleanup;
- actual image upload/staging;
- persistent WebSocket execution tracking;
- broader Telegram mutation commands;
- real Windows reboot -> automatic ComfyUI worker startup proof.

## Parallel Helix direction

Production can continue through the phases above without changing the provider-neutral brain architecture.

The main Helix brain path remains:

```text
Niche Intelligence
    ↓
Director
    ↓
Experiment Engine
```

Production should eventually consume stable creative/variant briefs from those layers and return durable media assets and generation metadata.
