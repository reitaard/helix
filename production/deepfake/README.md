# Deepfake Production

Status: **FaceFusion 3.8.2 is installed and the first local RTX 4060 execution completed successfully; visual/media-quality review and model comparison are next**.

This folder is the dedicated Helix workstream for identity-preserving face replacement on existing video.

The first required capability is deliberately narrow:

```text
one source identity image
+
one existing target video
        ↓
face / identity replacement
        ↓
output video
```

The output should preserve the target video's body performance, head motion, expression, camera, timing, resolution/FPS where practical, and original audio while replacing the selected face identity.

## Boundary

This is a **separate Production route**.

It is not a Nolan/LTX feature and it is not an Annie/FLUX feature. It must not be implemented as another `helix-runtime` Comfy profile merely because the current GPU PC also runs ComfyUI.

The research architecture is:

```text
local Windows validation first
        ↓
dedicated deepfake worker/runtime
        ↓
source image + target video
        ↓
optional reference preparation
        ↓
face-swap execution
        ↓
output video
```

A later deployed architecture may keep an always-on deepfake control/backend service on the VPS while GPU work executes on a dedicated worker process on the Windows GPU machine. ComfyUI may be called by that route only when image generation/editing is useful for reference preparation.

```text
future caller / Telegram / n8n
        ↓
VPS deepfake backend
        ↓ private worker connection
Windows deepfake worker
        ├── face-swap engine
        └── optional Comfy reference-preparation call
                ↓
              ComfyUI
```

The exact VPS/worker protocol is intentionally **not designed yet**. Local evidence comes first.

## Current decision

Start local testing with **FaceFusion 3.8.2** in a completely separate Python/Conda environment from `C:\AI\ComfyUI-CLI`.

Why it is the first baseline:

- current official release as of 2026-08-27 is `3.8.2` (published 2026-08-10);
- Windows + NVIDIA CUDA are first-class documented installation paths;
- `headless-run` already accepts source path(s), target path and output path;
- it has a built-in job manager/runner suitable for later worker wrapping;
- current swapper choices include HyperSwap, Ghost, InSwapper, SimSwap, HifiFace and UniFace families;
- it already contains target-face selection, occlusion/region masks, expression restoration, face enhancement and video output controls;
- it does not require turning the face-swap backend into a Comfy graph.

**CanonSwap** is the first dedicated research challenger after a FaceFusion baseline. Its published interface also directly accepts one source image and one target video and its research focuses on high-fidelity, temporally consistent video face swapping. Do not install it until the baseline test tells us what FaceFusion actually fails at on this GPU.

## First local execution checkpoint — 2026-08-29

The initial manual FaceFusion run completed all frames and reconstructed the output video successfully on the local RTX 4060.

Environment checkpoint:

```text
FaceFusion: 3.8.2
Python: 3.12.13
ONNX Runtime GPU: 1.24.4
CUDAExecutionProvider: available and used
GPU: NVIDIA GeForce RTX 4060, 8 GB class
FFmpeg: 9.0.1
```

First baseline configuration:

```text
processor: face_swapper only
model: hyperswap_1a_256
pixel boost: 256x256
weight: 0.5
video memory strategy: strict
execution threads: 8
provider: CUDA
detector: yolo_face 640x640, score 0.5
landmarker: 2dfan4, score 0.5
mask: box only, blur 0.3
enhancement/restoration: off
```

Execution result:

```text
analysing: 2378 / 2378
processing: 2378 / 2378
processing-to-video succeeded: 476.96 seconds
```

Observed resource pressure during the run:

```text
GPU utilization: reached 100%
dedicated VRAM: approximately 7.6 / 8.0 GB
shared GPU memory: approximately 10 GB
system RAM: approximately 30.3 / 31.8 GB (95%)
```

This proves the current Windows worker can execute a substantial FaceFusion workload on CUDA without immediate failure. It also confirms that an 8 GB RTX 4060 run can become heavily memory-bound and use substantial shared/system memory. Deepfake and Comfy generation should therefore be treated as mutually exclusive heavy GPU workloads on this machine unless later scheduler testing proves otherwise.

The target was reported as approximately 19 seconds long, but FaceFusion processed 2378 frames. Source/output FPS and final duration must be verified from media metadata rather than inferred from those two values.

The execution checkpoint is technically successful. Visual identity quality, temporal consistency, output resolution/FPS, and audio preservation still need inspection before D0 receives a final media-quality pass.

Detailed measurements and the evolving result table live in [`TEST_PLAN.md`](TEST_PLAN.md).

## Reference preparation is part of the route

Image generation/editing is a required research direction, but the backend must remain model-agnostic.

The intended hypothesis is:

```text
source portrait
+
representative target-video frame(s)
        ↓
image edit / reference generation
        ↓
identity-preserving references matched to target
pose / angle / lighting / crop
        ↓
face-swap engine
```

The existing local FLUX.2 Klein workflow is only the cheapest first way to test this hypothesis because it is already available on the worker. Helix is **not limited to FLUX.2, LTX, ComfyUI, or any current model family**. If another image model produces substantially better identity-preserving matched references, the deepfake route should be able to use it.

Generated references must be compared against the untouched source image. A generated image can improve pose/lighting compatibility while also drifting away from the true source identity; that tradeoff must be measured instead of assumed.

## Research order

```text
D0  FaceFusion raw baseline                EXECUTED; visual review pending
D1  FaceFusion swapper-model comparison    NEXT
after D1  mask / expression / restoration only when failure requires them
D3  best raw source-image result established
D4  generated/matched reference A/B
D5  multi-reference / multi-angle preparation if D4 helps
D6  CanonSwap challenger if FaceFusion temporal/identity quality remains insufficient
        ↓
only then design the VPS backend + Windows worker contract
```

See:

- [`RESEARCH.md`](RESEARCH.md) — current findings and candidate ranking.
- [`TEST_PLAN.md`](TEST_PLAN.md) — controlled local test sequence and measured results.
- [`INSTRUCTIONS.md`](INSTRUCTIONS.md) — rules for future implementation/Codex sessions.

## Explicit non-goals for the current checkpoint

- no deepfake command in Telegram yet;
- no changes to `helix-runtime` or its current media-job schema;
- no deepfake-specific PostgreSQL migrations;
- no installation inside the pinned ComfyUI Python environment;
- no attempt to make n8n own frame processing or GPU execution;
- no VPS deployment before local Windows quality/performance tests;
- no decision that the current RTX 4060 must remain the final deepfake GPU;
- no commitment to FLUX/LTX as the reference-generation stack;
- no commitment to FaceFusion as the final quality backend.

## Sources

- FaceFusion releases: https://github.com/facefusion/facefusion/releases
- FaceFusion installation: https://docs.facefusion.io/installation
- FaceFusion CLI paths: https://docs.facefusion.io/usage/cli-arguments/paths
- FaceFusion headless command: https://docs.facefusion.io/usage/cli-commands/general
- FaceFusion job manager/runner: https://docs.facefusion.io/usage/cli-commands/job-manager and https://docs.facefusion.io/usage/cli-commands/job-runner
- CanonSwap: https://github.com/Pixel-Talk/CanonSwap
