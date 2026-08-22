# Long-Video Continuation Comparison

**Status:** active Production experiment  
**Started:** 2026-08-21

Helix is comparing native LTX 2.5 generation and long-video continuation approaches before choosing when each backend should be used. This is an implementation comparison, not a new Helix-wide schema.

## Track N — Native full-resolution LTX 2.5

A new bare-LTX baseline now exists and changes the comparison substantially.

The F0 path removed:

- CGlide Director / Prompt Relay;
- Lightricks LoopingSampler;
- temporal overlap;
- secondary keyframes;
- latent ×2 upscaling in the executed path;
- Stage-2 diffusion in the executed path.

It generated directly at final spatial resolution from the first/only sampling stage.

### F0 4-second result — PASS

```text
97 frames
24 fps
736 × 1280 decoded
```

The motorcycle/rider remained the same subject with strong gross geometry and realism. Main weaknesses were small logo/decal drift and some composition movement.

### F0 8-second duration control — PASS

```text
193 frames
24 fps
736 × 1280 decoded
```

The same motorcycle/rider survived the full 8 seconds without duplicate subjects, disappearance or replacement-bike failure. Fine decals/logos still drifted, but the error stayed local rather than becoming whole-object identity collapse.

Important: changing duration changed the generation trajectory from the beginning. The 8-second render is not the 4-second render plus four appended seconds.

Implication:

```text
short/medium shot already fits one native generation
→ do not add a continuation engine by default
```

See `FULL_RES_NATIVE_I2V.md`.

---

## Track A — CGlide only

Use `CGlide/LTX-2.5-Director` for timeline control, chunk handoff, audio writing and final assembly.

Confirmed local baseline:

- one-chunk CGlide Director generation works;
- final Crop Guides after Stage 2 is required so appended guide frames do not leak into decoded output;
- corrected 8-second render is 193 frames at 24 fps;
- Chunk Writer creates 8 lossless PNG handoff frames;
- a second 193-frame chunk was generated from the handoff and automatically assembled;
- assembled result is 378 frames / 15.75 s plus aligned audio;
- motorcycle/rider/world continuity was promising;
- motion/camera velocity at the boundary remained perceptible;
- later-chunk realism may degrade.

CGlide remains a working continuation baseline and a useful Director/control surface.

CGlide must **not** be treated as an identity-reference system for LTX 2.5. Its old LTX 2.3 `@ref` / reference-sheet behavior is disabled on 2.5.

---

## Track B — Lightricks only

Use official `Lightricks/ComfyUI-LTXVideo` long-video sampling without CGlide Prompt Relay.

### B0 confirmed result — PASS as continuation mechanism

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

Findings:

- true overlapping temporal continuation works locally;
- bike/rider consistency was good;
- motion continuity and seam quality were stronger than the first CGlide single-image handoff baseline;
- later sections retained useful detail;
- scene/world/lighting state could drift subtly between temporal windows.

Important correction: later experiments changed `80/24/0.65 → 120/40/0.80` while also adding Director Prompt Relay and changing prompt structure. Those failures cannot be attributed to Lightricks alone.

### What Lightricks is for

`LTXVLoopingSampler` is primarily a temporal-extension / long-video engine.

Use it when:

```text
shot must exceed a comfortable native generation length
+ recent temporal context is useful for continuation
```

Do not use it merely because the shot is 4–8 seconds. The F0 native baseline shows that LTX itself can already handle that class well under restrained motion.

---

## Track C — Hybrid B

### Previous v1.3 — FAIL / PAUSED

The failed hybrid was:

```text
CGlide full-duration Prompt Relay
        ↓
Lightricks temporal windows
        ↓
two-stage native LTX path
```

Settings included:

```text
704 × 1280
15.04 s / 361 frames / 24 fps
120 temporal tile
40 overlap
0.80 overlap conditioning
AdaIN 0.10
Prompt Relay epsilon 0.50
549.18 s runtime
```

The original motorcycle was initially preserved, then left frame, and a completely different motorcycle was synthesized later. Overall verdict: **FAIL**.

### Confirmed/hypothesized failure contributors

1. **Temporal coordinate mismatch hypothesis** — Prompt Relay has a full-video timeline while LoopingSampler executes shorter overlapping windows; the current Prompt Relay scaling path does not receive each tile's true global start offset.
2. **Prompt Relay over-softening** — `epsilon=0.50` greatly broadened local-prompt leakage compared with the earlier strict setting.
3. **Aggressive overlap propagation** — `temporal_overlap_cond_strength=0.80` was above the Lightricks `0.50` default and could strongly preserve a bad framing state.
4. **Earlier reference mistakes** — a different motorcycle was once supplied as a later keyframe; padded references and generatively redrawn benchmark images also contaminated earlier tests.
5. **Too many variables changed together** — tile size, overlap, overlap strength, prompt structure and control layers were changed simultaneously.

The new native full-resolution PASS demonstrates that catastrophic motorcycle replacement is **not** an unavoidable property of LTX 2.5 itself.

---

## Hybrid re-entry design

The next hybrid must give each component a narrow job:

```text
native LTX
= visual generation quality

Lightricks
= temporal extension when duration requires it

CGlide / Director
= authoring of timed shot intent
```

### Do not repeat the old direct wiring

Do not put a full-duration Prompt Relay attention schedule directly inside every Lightricks temporal window until global tile timing is explicitly supported.

### Preferred first integration

```text
CGlide/Director timeline intent
        ↓
compile timeline into per-tile prompt intent
        ↓
LTXVMultiPromptProvider / tile-aware positive conditioning
        ↓
Lightricks LoopingSampler
        ↓
LTX generation
```

This uses both systems according to their intended roles without asking Prompt Relay to infer global time from a local tile.

For the first re-entry:

- use the successful green motorcycle source;
- keep the bike continuously in frame;
- use modest physical camera/motion changes;
- no second visual keyframe;
- no IC-LoRA yet;
- no negative-index memory yet;
- no `0.80` overlap strength;
- no broad `epsilon=0.50` Prompt Relay schedule;
- one experimental variable at a time.

If actual temporal extension is not needed for the requested duration, stay on native full-resolution LTX instead of forcing Lightricks into the graph.

---

## Decision principle

Prefer the smallest backend that satisfies the shot.

```text
short/medium shot fits native LTX
→ native LTX first

identity/detail-critical short shot
→ full-resolution native LTX candidate

long continuous extension
→ Lightricks

explicit timed control + extension
→ Director intent compiled to tile-aware Lightricks timing

multiple intentional camera shots
→ represent as multiple shots rather than one overloaded long generation
```

## Comparison criteria

Score each track on:

1. exact subject identity consistency;
2. rider/wardrobe/object geometry consistency;
3. motion continuity at boundaries;
4. camera-position and camera-velocity continuity;
5. scene/world/weather stability;
6. realism / later-section AI look;
7. sharpness/detail retention;
8. logo/decal/micro-detail persistence;
9. color/saturation/contrast drift;
10. prompt/control adherence;
11. multi-frame/keyframe behavior;
12. reproducibility;
13. runtime and VRAM/RAM behavior;
14. workflow complexity and debuggability;
15. suitability for explicit human controls and later agent suggestions.

## Current test order

```text
N0-4s  native full-resolution baseline                PASS
N0-8s  native full-resolution duration control       PASS
A0/A1  CGlide continuation baseline                  PASS
B0     Lightricks 80/24/0.65 continuation baseline  PASS as mechanism
C0-C3  old direct PromptRelay + Lightricks hybrids   FAIL / PAUSED
C4     tile-aware hybrid re-entry                     NEXT integration target
B0.1   standalone Lightricks 120/40/0.50             still useful if continuation needs isolated calibration
```

Do not increase to 30+ seconds until the tile-aware hybrid and/or clean Lightricks calibration has a stable identity result.
