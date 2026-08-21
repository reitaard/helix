# CGlide LTX 2.5 Director / Scene Chaining

**Status:** locally validated baseline for long-scene comparison.  
**Upstream:** `https://github.com/CGlide/LTX-2.5-Director`

## What has now been proven locally

The CGlide 2.5 fork is installed and loading on the active ComfyUI workstation.

Confirmed nodes:

```text
LTX Director CS (2.5)
LTX Director Guide CS (2.5)
LTX Director Crop Guides CS (2.5)
LTX Chunk Writer CS (2.5)
LTX Chunk Assembler CS (2.5)
```

The working two-stage topology is:

```text
CGlide Director
      ↓
Director Guide 0.5
      ↓
Stage 1 sampler
      ↓
Crop Guides
      ↓
x2 latent upscale
      ↓
Director Guide 1.0
      ↓
Stage 2 sampler
      ↓
Crop Guides        # required again after Stage 2
      ↓
decode
      ↓
Chunk Writer
```

The second Crop Guides node matters. Without it, appended guide frames leaked into decode and produced 201 output frames instead of the intended 193. After adding the final crop, the same generation path produced exactly 193 frames at 24 fps (~8.04 s).

## C0/C1/C2 results

### C0 — CGlide smoke — PASS

- CGlide Director drove the known-good LTX 2.5 backend.
- 1280x704 target / legal LTX latent near 1248x704.
- 193 pixel frames / 25 temporal latent frames.
- two-stage sampling completed.

### C1 — Chunk Writer — PASS

`LTX Chunk Writer CS (2.5)` received the corrected 193 decoded frames and wrote:

- 193 chunk frames;
- 8 lossless PNG handoff frames;
- chunk audio fitted to the chunk window.

Handoff location:

```text
C:\Users\MSP-PC\Documents\ComfyUI\input\ltx_director_handoff\c0_smoke\
```

Output run location:

```text
C:\Users\MSP-PC\Documents\ComfyUI\output\ltx_director_runs\c0_smoke\
```

### C2 — two-chunk continuation — PASS as mechanism test

Chunk 2 was generated from CGlide's handoff state and automatically assembled with chunk 1.

Observed assembly:

```text
chunk 1: 193 frames
chunk 2: 193 frames
overlap:   8 frames
final:   378 frames
fps:      24
video:    ~15.75 s
```

Audio was joined to the same expected 378-frame duration and muxed into the final MP4.

Human review found:

- same motorcycle identity largely preserved;
- same rider/helmet largely preserved;
- environment/world continuity good;
- no obvious hard scene reset;
- seam still perceptible as a motion/camera-velocity change;
- second chunk may look somewhat softer / more AI-like than the first, but this is not yet proven systematic.

This is a successful baseline, not a final optimized solution.

## Important correction about the handoff mechanism

The Chunk Writer saves the final N frames as clean PNG handoffs, with N snapped to the LTX temporal stride of 8.

However, the CGlide timeline continuation code currently places **one image anchor** from that handoff set for the next render window — specifically the first handoff frame at the beginning of the overlapping window. The saved strip is therefore used for overlap bookkeeping and assembly, but the generation continuation itself is currently anchored by a single still rather than a full multi-frame motion context.

This explains why appearance continuity can be strong while motion/camera velocity can still hitch at the boundary.

## Seam controls not yet optimized

CGlide's assembler supports:

```text
early_cut
early_scurve
early_blend
dissolve
hard_cut
```

The current baseline used `early_cut`.

`early_scurve` is explicitly intended to soften a short camera/motion velocity mismatch across the shared start of the overlap. It remains a useful optimization path if CGlide wins the broader comparison, but it is not the next priority: first compare against Lightricks temporal-overlap continuation.

## Safe install / rollback

The proven install kept the older WhatDreamsCost package recoverable outside active `custom_nodes`.

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI
New-Item -ItemType Directory -Force .\custom_nodes_disabled | Out-Null
Move-Item .\custom_nodes\WhatDreamsCost-ComfyUI .\custom_nodes_disabled\WhatDreamsCost-ComfyUI

cd .\custom_nodes
git clone https://github.com/CGlide/LTX-2.5-Director.git
```

Keep `ComfyUI-KJNodes` installed.

Rollback:

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI
Remove-Item -Recurse -Force .\custom_nodes\LTX-2.5-Director
Move-Item .\custom_nodes_disabled\WhatDreamsCost-ComfyUI .\custom_nodes\WhatDreamsCost-ComfyUI
```

## Current role in the comparison

CGlide is Track A and the working benchmark.

Do not run the four-chunk ~32-second CGlide limit test yet. First run the comparable Lightricks-only continuation test. After that, either:

- return to CGlide and optimize seam/overlap if it remains competitive;
- adopt Lightricks if it clearly improves temporal continuity;
- test a hybrid if combining the two has a concrete interface and expected benefit.

See `LONG_VIDEO_COMPARISON.md` and `LIGHTRICKS_LOOPING.md`.
