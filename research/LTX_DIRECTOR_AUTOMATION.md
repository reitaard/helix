# LTX Director / ComfyUI Automation Research

**Checked:** 2026-08-21  
**Status:** Production research input, not a permanent architecture commitment.

## Question

How much of WhatDreamsCost LTX Director can be driven by Helix agents/headless APIs while humans keep manual creative control where it is useful?

## Sources checked

- https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI
- `ltx_director.py`
- `ltx_director_guide.py`
- `js/ltx_director.js`
- upstream `example_workflows/LTX_Director_2_Workflow_Distilled.json`
- current upstream issues discussing LTX 2.5 compatibility

## Direct observations

The LTX Director node is not only a visual editor. Its Python node accepts structured inputs including:

- `global_prompt`;
- `timeline_data`;
- `local_prompts` and `segment_lengths`;
- image guide strengths;
- start/end/duration in frames or seconds;
- frame rate and output dimensions;
- resize/compression settings;
- custom audio/motion flags.

Its timeline state contains separate image/video, motion/IC-LoRA, and audio segments. Retake state includes a base video, retake start/length, prompt, and strength.

`LTXDirectorGuide` consumes the resulting guide data and exposes IC-LoRA/model controls such as IC-LoRA name/strength, image attention strength, scaling, crop/resize behavior, tiled encoding, and retake mode. Retake uses a temporal noise mask so preserved ranges can remain frozen while the selected region is regenerated.

The browser editor hides several machine values from the normal ComfyUI widget view, but those values are serialized into node/workflow state and consumed by the Python backend. This makes direct state compilation more appropriate for automation than mouse/drag automation of the timeline UI.

LTX Director also adds utility endpoints for:

- checking/reusing uploaded files: `GET /ltx_director_check_file`;
- extracting audio/waveform data: `GET /ltx_director_get_audio`;
- chunked large-video upload: `POST /ltx_director_upload_chunk`.

Smaller image/video assets use ComfyUI's normal upload path.

## Upstream two-stage wiring verified

The current upstream distilled Director example confirms this exact order:

```text
LTX Director
    ↓
LTXVConditioning
    ↓
LTX Director Guide (scale_by = 0.5)   ← Stage 1
    ↓
Stage 1 sampler
    ↓
Separate AV latent
    ↓
LTX Director Crop Guides
    ↓
x2 latent upscaler
    ↓
LTX Director Guide (scale_by = 1.0)   ← Stage 2
    ↓
Stage 2 sampler
```

The Stage 1 Guide receives Director `video_latent`, `guide_data`, `motion_guide_data`, and patched `model`. The Stage 1 sampled video latent then goes through `LTXDirectorCropGuides` before the latent upscaler. Stage 2 applies the 1.0 Guide to the upscaled latent and cropped conditioning.

This is the topology used by the current local D0 adaptation. The local workflow keeps LTX 2.5's existing samplers, dual AV CFG, x2 upscaler, and decode path instead of copying the upstream LTX 2.3 model assets.

## Local installation findings

Node loading is now validated on the actual workstation:

- active base/custom-node/venv root is `C:\Users\MSP-PC\Documents\ComfyUI` even though the Desktop program code is under AppData;
- WhatDreamsCost-ComfyUI and ComfyUI-KJNodes load from the active `Documents\ComfyUI\custom_nodes` directory;
- current ComfyUI required `av>=16.0.0`; an older PyAV caused a `ColorPrimaries` import failure before custom-node loading;
- `LTX Director` and `LTX Director Guide` are visible after the fix;
- a separate ComfyUI-LTXVideo custom-node folder has not been required so far;
- runtime LTX 2.5 Director generation remains unvalidated.

## Upstream compatibility note

The main project documentation still centers on LTX 2.3. In current upstream issue discussion, the maintainer states that the Director core works with LTX 2.5 and that the main remaining work is updated 2.5 workflows/models/features. The local node-loading result is encouraging, but model-generation compatibility is not proven until D0 renders successfully.

## Helix inference

LTX Director should be treated as one Production adapter/control surface, not as Helix Director itself.

A useful provisional boundary is:

```text
ContentSpec + VariantPlan
        ↓
Production planning
        ↓
ProductionPlan
        ↓
Backend adapter
   ├── native LTX
   ├── LTX Director / ComfyUI
   ├── hosted provider
   └── future backend
        ↓
MediaAsset
```

`ProductionPlan` is only a working internal name. Helix should not adopt LTX Director's `timeline_data` as its canonical cross-system schema.

## Agent opportunities

Agents can plausibly automate:

- converting creative beats into timed prompt segments;
- selecting/generating start, middle, and end keyframes;
- selecting reference assets and motion/IC-LoRA guidance;
- compiling timeline/audio/motion state;
- choosing native I2V versus a timeline-directed route;
- seed/parameter sweeps;
- job submission and monitoring through ComfyUI;
- technical/visual QA;
- detecting failed intervals and requesting targeted retakes/retries;
- preserving manifests, lineage, cost, and latency metadata.

Humans remain useful for subjective pacing, artistic changes, ambiguous failures, and final approval. Manual edits should be representable as overrides to the same structured production plan where practical.

## Likely routing pattern

- **Native I2V:** simple single-action shots where source fidelity and a small control surface are preferable.
- **Timeline-directed production:** shots that benefit from timed prompt changes, multiple keyframes, reference/motion guidance, audio layout, extension, or targeted retakes.

Routing should be decided by Production based on the requested variant, not by Helix Director knowing a specific model/tool.

## Validation still needed

1. Run D0 and prove LTX 2.5 INT8/ConvRot Director compatibility on the actual local stack.
2. Record the first successful workflow version, prompt id, output, runtime, warnings, and exact upstream commits.
3. Prove that agent-generated `timeline_data` and related node inputs can be submitted headlessly without relying on browser commit logic.
4. Export a working API-format Director workflow and document the exact variable fields an adapter must modify.
5. Test Prompt Relay with 2-3 timed local segments.
6. Test first/middle/last guides, Ingredients/reference IC-LoRA, motion guidance, extension, and Retake separately.
7. Measure runtime, memory, caching behavior, quality, and failure recovery on local hardware.
8. Validate retake boundary preservation and audio behavior before building automated QA → retake loops.
9. Pin upstream dependency versions before treating the adapter as production-stable.
