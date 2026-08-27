# Deepfake / video face-swap research

Date: **2026-08-27**

Status: **research sufficient to choose the first local baseline; no engine installed by this repo work**.

## Problem definition

The first Helix requirement is not video generation. It is transformation of an existing video:

```text
source: one identity image
target: one existing video
output: target video with selected face identity replaced
```

Target motion, expression, body, camera, timing and audio should remain target-derived.

A second-stage research requirement is to use image generation/editing to create stronger target-matched identity references before face swapping.

## What is relevant from previous Helix work

Only a small part of the existing LTX/FLUX work transfers directly:

1. The current RTX 4060 worker proves that the Windows GPU machine, Tailscale path and Comfy installation can execute useful local generative workloads.
2. The existing Comfy path can later provide optional image-reference preparation.
3. The existing Helix principle of exposing semantic intent rather than raw backend node IDs should be preserved.
4. The LTX reference-conditioning research established a useful conceptual separation between identity/appearance conditioning and scene/action generation.

What does **not** transfer:

- deepfake execution should not be forced into `video.i2v` or `video.t2v`;
- LTX MSR / Ingredients do not perform ordinary target-video face replacement;
- the current Annie FLUX workflow is not the deepfake backend;
- the current `helix-runtime` Comfy adapter should not be expanded before local validation proves the deepfake route.

## Candidate ranking

### 1. FaceFusion 3.8.2 — first baseline

**Decision: test first.**

The latest official GitHub release verified on 2026-08-27 is `3.8.2`, published 2026-08-10.

Why it matches the first Helix experiment:

```text
source image(s)
+
target image/video
+
output path
```

are first-class CLI inputs.

The current application includes:

- Windows installation path;
- CUDA execution provider;
- `headless-run`;
- batch mode;
- persistent job create/submit/run/retry commands;
- face selectors (`reference`, `one`, `many`);
- selectable face detector and landmarker;
- face occlusion and region masks;
- expression restoration using LivePortrait;
- face enhancement;
- output video controls;
- memory strategy (`strict`, `moderate`, `tolerant`).

Current face-swap model choices documented by FaceFusion include:

```text
blendswap_256
ghost_1_256
ghost_2_256
ghost_3_256
hififace_unofficial_256
hyperswap_1a_256
hyperswap_1b_256
hyperswap_1c_256
inswapper_128
inswapper_128_fp16
simswap_256
simswap_unofficial_512
uniface_256
```

Current community reports are useful only as test-design hints, not conclusions. Users commonly report that HyperSwap variants behave differently by identity/angle: `1B` is associated with side-view behavior while `1C` often gives stronger resemblance/head-shape retention but can miss harder frames. This argues for a controlled per-video model comparison rather than selecting one HyperSwap variant in advance.

### Why FaceFusion is better than starting with a Comfy face-swap node

The deepfake route is expected to become its own backend/worker. FaceFusion already exposes a headless and job-oriented execution surface. Wrapping that later is cleaner than installing experimental face-swap custom nodes into the pinned Comfy environment merely to reuse Comfy's queue.

It also protects the known-good LTX/FLUX environment from unrelated Python/ONNX/custom-node changes.

### What must be measured

FaceFusion is a framework containing several models and post-processors. A successful install does not tell us which combination is good enough.

The first local tests must separate:

```text
identity similarity
target expression preservation
pose / profile robustness
frame misses
flicker / temporal identity drift
occlusion handling
compositing boundary quality
skin/lighting compatibility
runtime
VRAM/RAM
output video/audio preservation
```

### Licensing gate

FaceFusion itself currently uses an OpenRAIL-AS license. Individual model families/dependencies can carry different restrictions. Research acceptance is therefore separate from a later commercial/Production licensing decision.

Do not infer that a model is commercially deployable merely because FaceFusion can download/run it.

---

### 2. CanonSwap — first quality challenger

**Decision: test only after the FaceFusion baseline.**

CanonSwap is the official implementation of the ICCV 2025 paper *CanonSwap: High-Fidelity and Consistent Video Face Swapping via Canonical Space Modulation*.

Its published inference interface directly matches the Helix primitive:

```text
python inference_canswap.py -s source.jpeg -t target.mp4
```

The public implementation is based partly on LivePortrait and uses a conventional Python/PyTorch/ONNX/InsightFace-style dependency surface rather than a 14B-class video diffusion model.

This makes it more realistic for an RTX 4060 experiment than many modern diffusion-video face replacement systems.

Why it is interesting:

- specifically targets video face swapping;
- specifically targets temporal consistency;
- canonical-space modulation is designed to stabilize identity transfer across video frames;
- input contract is already one source image + target video;
- does not require using ComfyUI.

Why it is not first:

- older pinned environment assumptions (`python 3.10`, PyTorch 2.3 / CUDA 11.8 in the published setup) make isolation essential;
- public documentation does not provide a trustworthy RTX 4060 / 8 GB VRAM requirement;
- setup requires several separately downloaded checkpoints;
- ResearchRAIL-M license requires a separate deployment/licensing review;
- FaceFusion is operationally more mature for headless/job wrapping.

CanonSwap should answer a precise question: **does a video-specialized temporal approach fix failures that remain after FaceFusion is tuned?**

---

### 3. VFace — architectural research reference

VFace (WACV 2026) is a training-free diffusion-based video face-swapping approach. Its most relevant idea for Helix is explicit temporal treatment rather than independent frame replacement:

- identity injection;
- target-structure guidance;
- flow-guided attention temporal smoothing.

This is important as a quality-direction benchmark if ordinary face-swap systems flicker or drift.

It is not the first local backend because the underlying diffusion stack is much heavier and more complex than required to establish the initial one-image + one-video capability.

---

### 4. Newer video-foundation / diffusion identity systems

Systems such as Stand-In, LivingSwap and DreamID-V show where high-end identity-consistent video editing is moving: temporal context, keyframe/reference-video conditioning, diffusion-transformer identity control and more global video reasoning.

They are useful for understanding the future ceiling but are not good first RTX 4060 Production tests. The initial route should not inherit a huge video-foundation model dependency before a smaller dedicated face-swap engine has been evaluated.

---

### 5. ReActor / InSwapper / older Roop-style paths

These remain useful as baselines and ecosystem references but should not define the architecture.

InSwapper is still present in FaceFusion and gives a recognizable classic baseline. ReActor is convenient inside ComfyUI, but convenience is not a reason to couple deepfake execution to the pinned Comfy environment.

If the first FaceFusion test includes `inswapper_128_fp16`, we already capture the important baseline without installing a separate Roop/ReActor stack.

---

## Image reference preparation

### Requirement

The supplied source image may be a bad match for the target video:

```text
source: frontal studio portrait

target video contains:
- 3/4 head turn
- strong profile
- warm side light
- open-mouth speech
- partial occlusion
```

The research hypothesis is that identity-preserving image editing can generate a better source set for those conditions.

Conceptually:

```text
source identity image
+
target representative frame
        ↓
reference-preparation image model
        ↓
matched source reference
        ↓
face-swap engine
```

Or:

```text
source identity image
        ↓
front / 3/4 / profile / lighting variants
        ↓
multiple source images / averaged source identity
        ↓
face-swap engine
```

FaceFusion has historically supported averaging a source face from multiple images, which makes a generated multi-view identity set worth testing if single matched references improve results.

### Do not lock the image backend

The deepfake contract should eventually ask for something like:

```text
prepare identity reference
identity_asset
pose / viewpoint target
lighting target
crop target
optional target frame
```

not:

```text
run FLUX node 76
```

Possible image backends can include FLUX.2, Qwen Image Edit, HiDream, a face-ID-specialized model, a future local model, or a provider API if Helix later chooses one.

### First reference-preparation test

Use the existing locally available FLUX.2 Klein workflow first **only because it minimizes setup cost**. It should not be treated as the expected winner.

The first test is simply:

```text
A: original portrait -> winning face-swap setup
B: generated target-matched reference -> same face-swap setup
```

If B does not clearly improve difficult frames without identity drift, stop using generated references for that case and investigate another image backend rather than forcing Klein.

---

## Proposed future architecture after local validation

Deepfake should have its own always-on control plane and execution worker.

```text
caller / Telegram / n8n
        ↓
VPS deepfake backend
  durable request state
  media staging / transfer
  job state
  worker heartbeat
  result metadata
        ↓ private connection
Windows deepfake worker
  engine adapter
  local temp workspace
  FaceFusion or future engine
        │
        ├── source image + target video
        │
        └── optional reference preparation
                  ↓
                ComfyUI or another image backend
```

The VPS should orchestrate; the GPU worker should execute.

Do not move GPU inference onto a non-GPU VPS merely to make the service always-on.

The dedicated deepfake worker is a separate runtime/process even if early testing occurs on the same physical Windows RTX 4060 machine that also hosts ComfyUI.

Concurrency must remain conservative while both workloads share one physical GPU. Do not allow a deepfake job and a heavy Comfy generation to compete for VRAM until an explicit scheduler/concurrency policy exists.

## Current recommendation

```text
FIRST
FaceFusion 3.8.2 local isolated install
        ↓
model/settings benchmark
        ↓
best raw source baseline

SECOND
image-reference preparation A/B
(existing Klein first only for convenience)
        ↓
keep or reject generated-reference hypothesis

THIRD
CanonSwap only if FaceFusion has meaningful temporal/identity failure

FOURTH
only after evidence
VPS backend + dedicated Windows deepfake worker implementation
```

## Sources

Primary/current:

- FaceFusion latest releases: https://github.com/facefusion/facefusion/releases
- FaceFusion install: https://docs.facefusion.io/installation
- FaceFusion Windows accelerator: https://docs.facefusion.io/installation/accelerator/windows
- FaceFusion paths: https://docs.facefusion.io/usage/cli-arguments/paths
- FaceFusion headless mode: https://docs.facefusion.io/usage/cli-commands/general
- FaceFusion execution: https://docs.facefusion.io/usage/cli-arguments/execution
- FaceFusion memory controls: https://docs.facefusion.io/usage/cli-arguments/memory
- FaceFusion swapper options: https://docs.facefusion.io/usage/cli-arguments/processors/face-swapper
- FaceFusion masks: https://docs.facefusion.io/usage/cli-arguments/face-masker
- FaceFusion expression restoration: https://docs.facefusion.io/usage/cli-arguments/processors/expression-restorer
- FaceFusion job manager: https://docs.facefusion.io/usage/cli-commands/job-manager
- FaceFusion job runner: https://docs.facefusion.io/usage/cli-commands/job-runner
- CanonSwap: https://github.com/Pixel-Talk/CanonSwap
- VFace: https://github.com/Sanoojan/VFace

Community evidence used only for test prioritization:

- FaceFusion community discussion of HyperSwap A/B/C behavior: https://www.reddit.com/r/FaceFusion/comments/1n4p7zj/
- July 2026 discussion of current pure face-swap quality limits: https://www.reddit.com/r/FaceFusion/comments/1um7l6j/
