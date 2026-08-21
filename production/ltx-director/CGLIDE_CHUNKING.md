# CGlide LTX 2.5 Director / Scene Chaining

**Status:** research selected for local validation. Not yet a confirmed workstation install.

This note tracks the CGlide `LTX-2.5-Director` fork as a candidate Production backend for long-scene chunking and continuity.

Upstream: `https://github.com/CGlide/LTX-2.5-Director`

## Why this is being tested

The current WhatDreamsCost-based Director path already proved:

- LTX 2.5 Director generation works locally;
- Prompt Relay executes with multiple temporal regions;
- appended image/keyframe guidance executes;
- the local 8-second, two-stage LTX 2.5 backend is viable on the RTX 4060 with heavy offload.

The unresolved problem is longer logical scenes. Independent 8-second generations can change the motorcycle, rider, camera state or motion at every boundary.

CGlide is useful because it already adds a long-video primitive instead of requiring Helix to invent one immediately.

## Direct upstream observations

CGlide describes this as an LTX 2.5 build based on WhatDreamsCost LTX Director. Its README lists:

- timeline image/text/audio/video segments;
- Prompt Relay;
- image anchors and end frames;
- multiple keyframes;
- **chunk render for long videos, with audio**;
- packed timelines.

The package registers separate 2.5-oriented nodes including:

```text
LTX Director CS (2.5)
LTX Director Guide CS (2.5)
LTX Director Crop Guides CS (2.5)
Clean Latent Slice CS (2.5)
LTX Chunk Writer CS (2.5)
LTX Chunk Assembler CS (2.5)
```

The chunk writer is the key new capability. It:

1. receives the generated image frames for one chunk;
2. writes the chunk under the ComfyUI output directory;
3. copies the final N frames into ComfyUI input as **PNG handoff frames**;
4. snaps `handoff_frames` to multiples of 8;
5. makes those frames available to guide the next chunk;
6. can assemble all chunks after the final chunk;
7. offers seam modes including `early_cut`, `early_scurve`, `early_blend`, `dissolve`, and `hard_cut`;
8. can join chunk audio as well.

Default handoff is `8` frames. Treat that as the first test value, not a Helix rule.

The writer stores handoffs under:

```text
ComfyUI/input/ltx_director_handoff/<run_name>/
```

and full run frames under a configurable output subfolder whose default is:

```text
ComfyUI/output/ltx_director_runs/<run_name>/
```

## Important 2.5 limitation

CGlide explicitly disables its older 2.3 reference-sheet / Ghost Mask / Licon MSR mechanisms for LTX 2.5 because the fork author reports that these corrupt 2.5 renders.

Do not confuse those disabled mechanisms with all IC-LoRA/reference conditioning. Official LTX 2.5 control/reference workflows should be evaluated separately later.

## Safe local install plan

The existing WhatDreamsCost installation is already proven and must remain recoverable.

CGlide warns against running conflicting Director packs together. For the local test, **do not delete WhatDreamsCost**. Move it outside the active `custom_nodes` folder, then install CGlide.

Stop ComfyUI first.

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI

New-Item -ItemType Directory -Force .\custom_nodes_disabled | Out-Null
Move-Item .\custom_nodes\WhatDreamsCost-ComfyUI .\custom_nodes_disabled\WhatDreamsCost-ComfyUI

cd .\custom_nodes
git clone https://github.com/CGlide/LTX-2.5-Director.git
```

Keep `ComfyUI-KJNodes`; CGlide's example workflow uses KJNodes Set/Get nodes.

No additional Python requirements are documented by CGlide beyond the LTX 2.5 stack and libraries already used by the current environment. Do not install speculative packages unless startup reports a real missing dependency.

Restart ComfyUI and verify these nodes appear:

```text
LTX Director CS (2.5)
LTX Director Guide CS (2.5)
LTX Director Crop Guides CS (2.5)
LTX Chunk Writer CS (2.5)
LTX Chunk Assembler CS (2.5)
```

If startup fails, capture the first CGlide-related traceback before changing packages.

### Rollback

Stop ComfyUI, then:

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI
Remove-Item -Recurse -Force .\custom_nodes\LTX-2.5-Director
Move-Item .\custom_nodes_disabled\WhatDreamsCost-ComfyUI .\custom_nodes\WhatDreamsCost-ComfyUI
```

Restart ComfyUI. This returns to the already-validated WhatDreamsCost path.

## Validation sequence

Do not start with a 32-second unattended run.

### C0 — CGlide smoke test

Goal: prove the CGlide Director can drive the known-good local LTX 2.5 backend for one short render.

Keep:

- existing LTX 2.5 INT8 ConvRot transformer;
- Gemma 4 LTX 2.5 encoder;
- BF16 video/audio VAE;
- existing x2 latent upscaler;
- existing two-stage sampler/decode path;
- 24 fps;
- fixed legal output dimensions;
- one image + one prompt.

Only after this passes should chunking become an experimental variable.

### C1 — one chunk writer test

Attach `LTX Chunk Writer CS (2.5)` to the decoded IMAGE frames of a successful short render.

Use initially:

```text
run_name: bike_chain_01
chunk_index: 1
handoff_frames: 8
save_all_frames: true
total_chunks: 2
auto_assemble: true
video_fps: 24
seam_mode: early_cut
assemble_match_levels: true
```

Pass condition:

- chunk 1 renders;
- 8 PNG handoff frames appear under `input/ltx_director_handoff/bike_chain_01/`;
- the handoff set can be selected/used for the next Director window.

### C2 — two-chunk continuation

Generate chunk A, then generate chunk B using A's handoff set.

Question:

> Does B feel like the next part of A, with the same motorcycle/rider/camera state, better than an independent B?

Do not add identity banks, Motion Track, automated metrics or agent mutation yet.

## 32-second target after C0/C1/C2 pass

The first long test should be a **single logical motorcycle scene**, not four unrelated scenes.

Provisional plan:

```text
Chunk 1: approach and enter the broad curve
Chunk 2: inherit motion; deepen the lean
Chunk 3: inherit motion; hold and begin exit
Chunk 4: inherit motion; straighten and accelerate away
```

Start with four approximately 8-second LTX windows and an 8-frame overlap/handoff between adjacent chunks. Because overlap frames are removed/merged during assembly, four nominal 8-second windows will produce slightly less than 32 seconds unless window lengths are adjusted. Exact final duration should be chosen only after CGlide's local Render All/window behavior is confirmed.

For the first long run, prefer:

```text
fps: 24
handoff_frames: 8
seam_mode: early_cut
same generation model/settings as validated local LTX 2.5
sequential chunk execution
no extra IC-LoRA
no automated QA
```

Expected compute is roughly four local generation jobs plus assembly overhead, so the user should expect on the order of 4x the current per-chunk runtime rather than a single 32-second diffusion pass.

## Architecture boundary

CGlide chunking is a Production implementation candidate, not a new Helix-wide schema.

If it proves reliable, Helix can later express a simple scene/chunk continuation intent and let the CGlide adapter compile it to handoff frames, chunk indices and seam settings. Do not design a full continuity engine before the existing primitive has been tested.
