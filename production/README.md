# Production

Production is the Helix execution layer. It owns generation/editing backends, worker/runtime reliability, semantic workflow binding, artifact delivery, and model-specific research controls.

The current generation direction is **open/self-hosted first**. Runway is not part of the active Production plan. Seedance-class systems are behavioral/quality references rather than integrated dependencies.

## Current execution path

```text
n8n / caller / Telegram
    ↓
helix-runtime
    ├── helix-db
    ├── JobService / WorkerService
    ├── Telegram operator + generation services
    ├── DeliveryWorker
    └── ComfyAdapter / ComfyClient
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

The worker/runtime boundary supports durable numbered media identity, asynchronous workflow submission, Comfy Prompt-ID persistence, queue/history reconciliation, restart recovery, cancellation, running-job timeout, artifact capture/retrieval, durable Telegram delivery, bounded retry, diagnostics, confirmed T2V/T2I submission, persisted settings, reset state, and T2V generation modes.

One global numeric media-reference namespace is shared by Helix jobs and direct/manual ComfyUI artifacts. Direct ComfyUI runs do not become fake Helix jobs.

See [`comfyui-worker/`](comfyui-worker/) for the worker checkpoint and [`media-runtime/`](media-runtime/) for runtime details.

## Physical worker and logical Production Profiles

There is one physical worker:

```text
worker ID: helix-rtx4060-01
GPU: RTX 4060
physical GPU concurrency: 1
```

Logical profiles on that worker:

```text
nolan / Christopher Nolan
-> video.i2v
-> video.t2v

leibovitz / Annie Leibovitz
-> image.t2i
```

Profiles are tool authority/operator presentation. They do not imply separate GPUs, Comfy instances, queues, or adapters.

## T2V semantic settings

`Christopher Nolan / video.t2v` has persisted semantic base settings.

Core:

```text
asp   Aspect
qual  Quality
time  Duration
enh   Prompt Enhance
```

Advanced settings require explicit `-dev` authority:

```text
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
Quality      Standard -> 0.9 MP
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

The binder maps these concepts into vetted workflow inputs. Raw Comfy node IDs remain implementation details.

## Generation modes

Christopher Nolan remains the Production profile/authority. `manual`, `fast`, and `quality` are generation modes applied above stored T2V settings.

```text
stored manual settings
        ↓
selected mode overlay
        ↓
effective settings snapshot
        ↓
workflow binder
        ↓
ComfyUI
```

Modes never rewrite stored manual settings. There is no `auto` mode.

Current v1 policy:

```text
manual
  no overlay

fast
  Quality   Standard / 0.9 MP
  Duration  5 s
  FPS       24

quality
  Quality   High / 1.2 MP
  Duration  8 s
  FPS       24
```

Fast/Quality still need controlled calibration before their values should be treated as optimized presets.

## Native LTX checkpoint

Native LTX 2.5 is the first-choice Production path for focused shots inside its proven comfort zone.

Controlled research has covered 5 s, 8 s, and 10 s native T2V runs and established useful behavior around temporal allocation, camera/action planning, native hard cuts, and joint audiovisual generation.

Current policy:

```text
focused shot inside native comfort zone
-> native LTX first

multiple distinct semantic/narrative beats
-> consider Prompt Relay

strict physical state / identity / continuation problem
-> use the specific Production control that targets that failure class
```

Exact collision geometry, fragile possession chains, strict multi-object physical state, and guaranteed final-state completion remain weaker classes.

## Prompt Enhance checkpoint

Prompt Enhance has already been tested. For already-directed Helix prompts it should generally remain **OFF**.

The useful lesson is not to keep a second automatic director in the final path. Prompt-structuring principles discovered through enhancement testing should be incorporated into Helix-side prompt compilation instead.

## Prompt Relay checkpoint

Prompt Relay is locally validated with native LTX 2.5.

Its useful abstraction is:

```text
temporal semantic routing / scene progression
```

It can reduce future-event leakage and give distinct narrative beats more temporal ownership. It is **not** a hard timestamp switch, physics controller, or persistent object-state machine.

## Reference-conditioning checkpoint

Reference conditioning has moved beyond pure research proposals.

### Licon MSR

A one-subject LTX 2.5 MSR test has locally passed the key initial behavior: recognizable identity/appearance survived while the generated scene/composition changed substantially.

Pending work includes stronger viewpoint retention, multi-subject slot separation, person/product/background interactions, and combined timing/reference tests.

### Lightricks Ingredients

Ingredients Core IC-LoRA has locally reconstructed a new scene from person + product + location references on the LTX 2.3 stack. The cheap 8-step path proves the mechanism but not the quality ceiling.

Higher-quality 30-step / CFG / STG validation remains pending.

See [`ltx-director/README.md`](ltx-director/README.md) for detailed findings.

## T2I checkpoint

Annie Leibovitz owns the narrow `image.t2i` path.

The active runtime workflow candidate is FLUX.2 Klein 4B **INT8 W8A8**. The prior Distilled FP8 path remains installed for rollback and was successfully validated earlier.

V1 exposes only:

```text
prompt
aspect
seed
```

The binder mutates only vetted prompt, width, height, and seed inputs. T2I modes and model switching remain deferred.

## Telegram Production surface

Private operator chat provides diagnostics, job/download inspection, failures/events/outbox, guarded cancellation, T2V/T2I generation, settings, and developer controls.

The repository also contains Image/Video forum-topic generation routing with per-topic policy, isolated pending state, selective ForceReply prompt capture, and inline confirmation buttons.

The newer lifecycle/progress implementation is present in the repository, including persistent Comfy execution WebSocket telemetry and in-place lifecycle delivery. The exact live VPS migration/container checkpoint must be re-verified before describing that feature as deployed.

## Production workflow policy

Do not expose raw Comfy graph structure as the long-term Helix contract.

```text
creative / generation intent
        ↓
semantic Production settings
        ↓
optional tool-specific controls
        ↓
workflow binder / adapter
        ↓
backend workflow
```

Prompt Relay, LTX Director, MSR, Ingredients, continuation samplers, model files, raw node IDs, and backend timing details stay inside Production unless repeated evidence proves a higher-level concept belongs in the stable Helix contract.

## Remaining Production work

- controlled Fast vs Quality vs Manual calibration;
- stronger MSR viewpoint and multi-subject validation;
- higher-quality Ingredients validation;
- broader image upload/staging for I2V/reference flows;
- worker output-retention policy;
- real Windows reboot / AtStartup validation;
- submission-window recovery and concurrent API idempotency hardening;
- service authentication before broader network exposure;
- CI/integration-test and migration-governance hardening;
- verify current live Telegram lifecycle migration/runtime state.

Production should continue feature-by-feature behind the stable runtime/adapter boundary without reopening already-solved identity or worker-boundary decisions.
