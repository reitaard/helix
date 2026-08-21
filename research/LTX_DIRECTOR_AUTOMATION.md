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

## Upstream compatibility note

The main project documentation still centers on LTX 2.3. In current upstream issue discussion, the maintainer states that the Director core works with LTX 2.5 and that the main remaining work is updated 2.5 workflows/models/features. Treat this as an upstream claim until validated on our pinned ComfyUI/LTX 2.5 stack.

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

1. Install/pin the current WhatDreamsCost nodes without disturbing the known-working LTX 2.5 workflow.
2. Verify LTX 2.5 INT8/ConvRot compatibility on the actual local stack.
3. Prove that agent-generated `timeline_data` and related node inputs can be submitted headlessly without relying on browser commit logic.
4. Export a working API-format Director workflow and document the exact variable fields an adapter must modify.
5. Test Prompt Relay, first/middle/last guides, Ingredients/reference IC-LoRA, motion guidance, extension, and Retake separately.
6. Measure runtime, memory, caching behavior, quality, and failure recovery on local hardware.
7. Validate retake boundary preservation and audio behavior before building automated QA → retake loops.
8. Pin upstream dependency versions before treating the adapter as production-stable.
