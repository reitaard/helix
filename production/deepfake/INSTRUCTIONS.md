# Deepfake workstream instructions

These instructions define how future Helix sessions should work on the deepfake Production route.

## Scope

The initial user-visible capability is:

```text
one source identity image
+
one target video
        ↓
identity / face replacement
        ↓
one output video
```

Reference-image generation/editing is part of the research pipeline because the supplied source portrait may not match the target video's pose, viewpoint, crop or lighting.

## Architectural rules

1. **Deepfake is a separate Production route.**
   Do not implement it as a Nolan/LTX mode or Annie/FLUX setting.

2. **Do not couple the route to one image or video model family.**
   FLUX.2 Klein may be used for the first reference-preparation experiment because it already exists locally, but the eventual image-preparation backend must remain replaceable.

3. **Local Windows validation comes before VPS architecture.**
   Do not add VPS services, migrations or remote job protocols until the manual quality/performance gate in `TEST_PLAN.md` passes.

4. **Keep face-swap environments isolated from ComfyUI.**
   FaceFusion, CanonSwap or future engines must not install packages into `C:\AI\ComfyUI-CLI\.venv` or modify the pinned Comfy Python dependency set.

5. **ComfyUI is optional reference preparation, not the deepfake executor contract.**
   The deepfake route may call Comfy later to generate/edit identity references, but the primary face-swap backend can be an independent process/service.

6. **The later VPS is the always-on control plane, not necessarily the inference machine.**
   The intended pattern is VPS orchestration + private GPU worker execution.

7. **The deepfake worker is a separate runtime/process.**
   It may initially run on the same physical Windows RTX 4060 machine for testing, but it should not be represented as the existing Comfy worker adapter.

8. **Do not run heavy deepfake and Comfy GPU work concurrently on the current RTX 4060 without an explicit scheduler.**

9. **Do not let n8n own low-level frame processing, engine polling or GPU state.**
   n8n can orchestrate high-level workflows later.

10. **Keep engine-specific details behind an adapter/binder boundary later.**
    FaceFusion model names, CanonSwap checkpoints and image-model node IDs should not become long-term Helix semantic contracts.

## Tool / collaboration rules

### This ChatGPT/project session

Use this environment for:

- research;
- architecture discussion;
- reviewing manual test outputs/logs;
- comparing results;
- small GitHub documentation/research updates through the connector.

Do not assume this session has direct shell access to the user's Windows GPU PC or VPS.

### Manual user work

The user performs local Windows installation, commands and media tests when instructed during a dedicated test session.

Commands should be given only after the current machine state/version has been checked. Do not dump a large installation script in advance and assume it ran.

### Codex

Use Codex for substantial backend/code implementation once the local experiment establishes the contract.

Expected later Codex tasks may include:

```text
VPS deepfake backend service
Windows deepfake worker service
engine adapter
media staging/transfer
job state
health/heartbeat
cancellation/timeout
result retrieval
optional Comfy reference-preparation client
GPU scheduling / mutual exclusion
```

Do not ask Codex to build the Production backend before the research gate passes.

## Local test rules

Before each engine install or upgrade record:

```text
engine version / commit
Python version
CUDA/runtime requirements
ONNX Runtime or PyTorch version
FFmpeg
model/checkpoint versions
licenses
```

For every output record:

```text
input source image ID/name
input target video ID/name
engine
swapper model
relevant detector/mask/restoration settings
runtime
VRAM/RAM observation
output metadata
qualitative failures
```

Use fixed assets and one-variable changes wherever practical.

## Current baseline decision

First engine:

```text
FaceFusion 3.8.2
```

Install into its own Conda/Python environment during the dedicated manual test session.

First challenger:

```text
CanonSwap
```

Do not install until FaceFusion has produced a measured baseline and a specific unresolved failure justifies the comparison.

First reference-preparation experiment:

```text
existing local image-generation capability
(current FLUX.2 Klein path is acceptable for the first A/B)
```

But the research question is model-independent:

> Does a generated reference matched to the target video's pose/view/light improve the final face swap without damaging source identity?

## Quality rule

Do not optimize benchmark obedience at the expense of finished-media quality.

Evaluate separately:

```text
identity
pose/profile robustness
expression preservation
temporal stability
occlusion handling
compositing
video/audio preservation
performance
```

A sharper frame is not automatically a better deepfake if it flickers, changes identity through motion, or damages target expression.

## Licensing rule

Research and Production acceptance are separate gates.

Before any monetized/client-facing deployment, review the license/restrictions for:

- the framework;
- face-swap model weights;
- face detector/recognizer weights;
- restoration/enhancement models;
- any image-reference generation model;
- any dependent model whose weights are redistributed or called in Production.

Do not infer commercial permission from technical compatibility.

## Documentation rule

Keep this folder as the primary record while the route is experimental.

Do not expand `docs/PROJECT_STATE.md` with speculative deepfake architecture. Update global Project State only after the local baseline is proven or a Production implementation checkpoint exists.

When test results arrive, update `TEST_PLAN.md` and add focused result notes rather than rewriting unrelated LTX/Telegram docs.
