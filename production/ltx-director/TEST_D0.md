# D0 runtime test

**Goal:** prove that LTX Director can control the existing local LTX 2.5 two-stage generation path without changing the wider Helix architecture.

## Test artifact

Current local artifact:

```text
video_ltx2_5_director_d0_v2.json
```

Do not treat this workflow as the canonical Production adapter yet. Keep it out of the repository as a working workflow until one generation succeeds.

## What D0 is testing

```text
manual prompt
    ↓
LTX Director global prompt
    +
Director timeline start image
    ↓
Director Guide scale 0.5
    ↓
existing LTX 2.5 Stage 1
    ↓
Crop Guides → x2 latent upscale
    ↓
Director Guide scale 1.0
    ↓
existing LTX 2.5 Stage 2
    ↓
decode / SaveVideo
```

This topology follows the current upstream distilled Director example. The 0.5 Guide belongs to Stage 1; the 1.0 Guide belongs after the x2 upscale for Stage 2.

## Before queueing

1. Keep the original native LTX 2.5 workflow open/available as the known-good control.
2. Import `video_ltx2_5_director_d0_v2.json` as a separate workflow.
3. Confirm there are no red/missing nodes.
4. Confirm `motorcycle-stability-control-16x9.jpg` still exists in the active ComfyUI input directory.
5. Use the normal outer `prompt` field. In D0 v2 it is wired to `LTXDirector.global_prompt`.
6. Leave Prompt Enhance off.
7. Keep the Director duration at 8 seconds and frame rate at 24 fps.
8. Inside the LTX 2.5 subgraph, confirm the Director timeline shows the motorcycle image at the beginning.
9. Leave custom motion and custom audio tracks disabled/empty.
10. Do not add local Prompt Relay segments yet.

## Queue

Queue exactly one generation.

Do not change sampler, sigma schedules, model, VAE, upscaler, or unrelated settings during this first run.

## D0 pass condition

D0 passes when:

- the workflow queues without graph/schema errors;
- Director executes using the supplied global prompt and starting image;
- both LTX 2.5 stages complete;
- a playable video is saved;
- the output duration/frame rate are sensible;
- the source image is visibly respected as the starting condition;
- the Comfy prompt id, output filename, runtime, and any warnings are recorded.

Image quality does not have to beat the native workflow yet. D0 is an integration test first.

## If it fails

Capture the **first meaningful error**, not only the last line of the console.

Record:

```text
Failure stage:
Node name / node id:
Exception:
First relevant traceback lines:
Was the workflow accepted by ComfyUI? yes/no
Did Director execute? yes/no/unknown
Did Stage 1 start? yes/no/unknown
Did Stage 2 start? yes/no/unknown
```

Change one thing at a time after a failure. Do not add IC-LoRA, retake, extension, custom audio, n8n, or automated QA until D0 passes.
