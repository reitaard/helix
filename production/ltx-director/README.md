# LTX Director

This folder is the Helix Production workspace for evaluating and integrating LTX 2.5 generation, CGlide Director-style controls, and long-video continuation backends.

It is **not** the Helix Director. Helix Director remains model/provider agnostic. This folder is about how Production compiles explicit generation intent into LTX/ComfyUI execution state.

## Proven local foundation

The workstation has validated:

- native/local LTX 2.5 two-stage I2V generation;
- native full-resolution single-stage LTX 2.5 I2V generation;
- CGlide LTX Director 2.5 wiring inside the native LTX graph;
- Prompt Relay with multiple temporal regions;
- appended image/keyframe guidance;
- CGlide chunk writing, handoff PNGs, audio joining and final assembly;
- official Lightricks `LTXVLoopingSampler` running locally over both LTX 2.5 stages.

## Current quality baseline — native full-resolution LTX

A new bare-LTX F0 benchmark removed CGlide, Prompt Relay, Lightricks temporal tiling, secondary references, latent ×2 upscaling and the second diffusion stage.

The portrait motorcycle test produced:

```text
4 s   → 97 frames  @ 24 fps
8 s   → 193 frames @ 24 fps
actual decoded size: 736 × 1280 after LTX dimension snapping
```

Both runs preserved the same green motorcycle and rider without duplicate subjects, disappearance or replacement-bike failure. Gross fairing/headlight/windscreen geometry remained stable. The remaining drift was mostly micro-detail: decals/logos, tiny surface/mechanical detail and some composition movement.

The 8-second run did **not** simply extend the 4-second trajectory. Changing duration changed the generated motion/composition from the beginning, even with the same seed and otherwise comparable setup.

See `FULL_RES_NATIVE_I2V.md` for the exact findings and limits.

## Long-video findings

### CGlide baseline

CGlide produced a real two-chunk continuation:

```text
193-frame chunk 1
193-frame chunk 2
8-frame overlap
378-frame final @ 24 fps
~15.75 s assembled video + aligned audio
```

The bike/rider/world remained broadly coherent. The main weakness was the boundary: motion/camera velocity was perceptibly less smooth, and later-chunk realism may degrade.

### Lightricks baseline

The first Lightricks-only test produced:

```text
361 frames
24 fps
1280 × 704
~15.04 s
566.36 s runtime
```

Subject consistency and motion continuity were better than the first CGlide single-image handoff baseline. The remaining weakness was gradual world/lighting drift between temporal windows.

Lightricks is now treated primarily as a **temporal-extension engine**, not the default backend for every short shot.

## Hybrid B status

**Paused after v1.3 failure.**

The failed hybrid combined a full-duration CGlide Prompt Relay schedule with Lightricks temporal tiles while also pushing overlap conditioning and other controls. The original motorcycle eventually left frame and a different motorcycle was synthesized later.

Important current rules:

- do not treat CGlide as an identity-reference layer; its old LTX 2.3 `@ref` / reference-sheet behavior is disabled for 2.5;
- do not directly layer full-duration Prompt Relay over LoopingSampler again until global tile timing is solved;
- do not assume `0.80` overlap conditioning is better than the Lightricks `0.50` default;
- do not use a visually different motorcycle as a later keyframe;
- change one experimental variable at a time.

The preferred hybrid re-entry is to translate Director intent into **tile-aware Lightricks positive conditioning** (`LTXVMultiPromptProvider` / equivalent) rather than replaying one full-video attention schedule independently inside each tile.

## Current role split

```text
shot fits comfortably in one native generation
→ native LTX first

identity/detail-critical short shot
→ full-resolution native LTX is a validated candidate

long continuous extension
→ Lightricks LoopingSampler

explicit timed direction
→ CGlide/Director intent compiled into backend-compatible timing
```

This is still experimental Production policy, not a frozen Helix schema.

## Relevant notes

- `FULL_RES_NATIVE_I2V.md` — locally validated bare full-resolution motorcycle baseline;
- `LONG_VIDEO_COMPARISON.md` — continuation tracks, failure analysis and test order;
- `HYBRID_B_V1.md` — failed hybrid history and re-entry constraints;
- `CGLIDE_CHUNKING.md` — proven CGlide handoff baseline;
- `LIGHTRICKS_LOOPING.md` — Lightricks role, implementation and calibration notes;
- `INSTALL.md` — workstation/custom-node setup;
- `DIRECTOR_SHOT.md` — temporary Production-side test contract.

## Architecture boundary

The current ComfyUI graphs are execution prototypes, not the final agent-facing interface.

Useful Production controls may eventually include global/timed prompts, duration/fps/dimensions, image keyframes and strengths, motion controls, retake/extension policy, seed and backend execution settings.

Backend-specific details should remain behind a Production adapter until experiments show which controls deserve to become stable Helix concepts.
