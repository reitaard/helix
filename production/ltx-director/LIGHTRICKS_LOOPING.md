# Lightricks ComfyUI-LTXVideo / Looping Sampler

**Status:** installed and locally proven, but role is being narrowed after hybrid failures.  
**Upstream:** `https://github.com/Lightricks/ComfyUI-LTXVideo`

## What the LoopingSampler is actually for

The upstream design is a long-video / memory-management sampler. It divides a video latent into overlapping temporal windows, generates the first window, then extends later windows from the preceding temporal context.

That makes it a strong candidate for:

- videos that are longer than a convenient single generation;
- continuous motion that can be extended from recent visual context;
- memory-efficient long-form generation;
- moderate prompt evolution through its own tile-aware conditioning tools;
- later experiments with long-term context latents.

It is **not** itself a shot Director. It does not inherently know a global camera timeline such as `front at 0–5 s, orbit at 5–10 s, side at 10–15 s` unless that timing is mapped into the temporal tiles correctly.

For Helix, do not make LoopingSampler the default backend for every short shot merely because it can generate a long sequence. Native LTX 2.5 remains preferable when the requested shot comfortably fits in one stable generation. LoopingSampler becomes useful when continuation length or memory is the actual problem.

## Core behavior confirmed from upstream code

Later temporal windows use `LTXVExtendSampler`.

The extension path:

1. selects the final overlap latents from the previous generated result;
2. creates the next temporal latent;
3. inserts the previous overlap as a latent guide at the beginning of the new window;
4. uses `temporal_overlap_cond_strength` as that guide's strength;
5. generates only the new continuation frames while preserving the overlap context.

This is **not** a simple cross-fade between two independently generated temporal clips.

The node default for:

```text
temporal_overlap_cond_strength
```

is `0.50`.

Higher values can improve continuity, but they also more strongly preserve mistakes in the preceding window. If a subject is already drifting or leaving frame, a very high strength can propagate that failure.

## Important controls

```text
temporal_tile_size
temporal_overlap
temporal_overlap_cond_strength
cond_image_strength
adain_factor
optional_positive_conditionings
optional_negative_index_latents
optional_normalizing_latents
```

`optional_positive_conditionings` is the intended hook for different positive conditioning per temporal tile, normally supplied by `LTXVMultiPromptProvider`.

`optional_negative_index_latents` exists specifically to provide long-term context to each temporal extension. Do not add it until the basic continuation path is calibrated.

## Local baseline history

### B0 — PASS as a long-video mechanism

```text
LTXVLoopingSampler on both generation stages
361 frames
24 fps
1280 × 704
~15.04 s
566.36 s runtime
```

Settings:

```text
temporal_tile_size              80
temporal_overlap                24
temporal_overlap_cond_strength  0.65
AdaIN                           0.15
spatial tiles                   1 × 1
```

Observed:

- genuine temporal continuation worked;
- motorcycle/rider consistency was good;
- boundary motion was smoother than the first CGlide single-image handoff;
- later detail remained competitive;
- world/background/lighting could feel as if it was slowly changing across windows.

This proved that LoopingSampler works locally. It did **not** prove that stronger/larger temporal settings are always better.

## What we over-tuned later

A later hybrid changed several variables at once:

```text
80 / 24 / 0.65
→
120 / 40 / 0.80
```

while also adding CGlide Prompt Relay and changing prompt structure.

Because tile size, overlap amount, overlap strength and temporal direction all changed together, those runs cannot establish which setting caused each failure.

Important correction:

- `120 / 40` is a reasonable one-third overlap geometry;
- `0.80` was a Helix experiment, not an upstream recommended optimum;
- stronger continuity is not automatically higher quality.

## Intended Helix usage

### Good fit

Use LoopingSampler when:

- a single scene must extend beyond a comfortable native LTX generation length;
- camera/motion state evolves continuously rather than jumping between unrelated shots;
- recent temporal context is useful for continuation;
- the shot can be described with one stable prompt or prompts explicitly aligned to temporal tiles.

Examples:

```text
vehicle continues driving down one road
character keeps walking through the same space
slow dolly/tracking movement
continuous atmospheric/environmental action
long establishing motion
```

### Higher-risk fit

Treat LoopingSampler cautiously when one long generation demands large internal camera choreography, for example:

```text
front tracking
→ rapid orbit
→ exact side lock
→ another camera mode
```

That is not forbidden, but it creates more opportunity for a temporal extension to inherit a bad framing state. If precise choreography is required, prefer either:

- one native shot if duration permits;
- several deliberately designed shots connected at a higher level;
- tile-aware prompt conditioning rather than a full-video attention schedule applied independently inside every tile.

## Current calibration test

Before another hybrid, run a clean Lightricks-only calibration:

```text
native first-frame I2V
15 s / 24 fps
704 × 1280
120-frame temporal tile
40-frame overlap
0.50 overlap conditioning
AdaIN 0.10
1 × 1 spatial tiles
one continuous positive prompt
no CGlide Prompt Relay
no secondary keyframe
no long-memory latent
```

The camera should remain comparatively stable. The purpose is to measure what LoopingSampler itself does to subject identity and realism.

If this passes, tune one variable at a time:

```text
0.50 → 0.60 → 0.65
```

only if the observed seam/continuity problem justifies it.

Do not jump straight back to `0.80`.

## Relationship to CGlide / Director

Current interpretation:

```text
Native LTX
  = preferred for a shot that already fits comfortably in one generation

CGlide Director
  = useful authoring/control surface and proven chunk-handoff baseline

Lightricks LoopingSampler
  = long temporal continuation engine

Hybrid
  = valid only when Director intent is translated into tile-aware Lightricks timing,
    or Prompt Relay is modified to understand each tile's true global offset
```

Do not directly layer a full-duration Prompt Relay mask over LoopingSampler again until that temporal mapping is validated.

## Installation

Stop ComfyUI first.

```powershell
cd C:\Users\MSP-PC\Documents\ComfyUI\custom_nodes
git clone https://github.com/Lightricks/ComfyUI-LTXVideo.git

& "C:\Users\MSP-PC\Documents\ComfyUI\.venv\Scripts\python.exe" -m pip install -r .\ComfyUI-LTXVideo\requirements.txt
```

Restart and verify:

```text
LTXV Looping Sampler
STG Guider Advanced
LTXV Multi Prompt Provider
```

Exact classes:

```text
LTXVLoopingSampler
STGGuiderAdvanced
LTXVMultiPromptProvider
```
