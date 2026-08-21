# LTX Scene Continuity Research

**Checked:** 2026-08-21  
**Status:** active Production research input; not a frozen Helix architecture.

## Research question

How should a long logical LTX 2.5 scene be generated when practical generation windows are much shorter, without assuming each new window will preserve subject identity, world state, camera motion and realism automatically?

## Working model

Long-scene continuity needs at least two kinds of information:

```text
short-term continuity
  recent visual/motion state across the boundary

long-term continuity
  subject/world identity and persistent constraints
```

Prompt text alone is insufficient, and a previous generated frame should not automatically become the only long-term source of truth because drift can accumulate.

## CGlide findings — now locally validated

`CGlide/LTX-2.5-Director` is no longer only a research candidate. The local test proved:

- CGlide Director works with the current LTX 2.5 backend;
- final Stage-2 Crop Guides is required to remove appended guide frames before decode;
- corrected short output is 193 frames at 24 fps;
- Chunk Writer produces 8 lossless handoff PNGs;
- a second chunk can be generated and automatically assembled;
- two 193-frame chunks with 8-frame overlap assembled to 378 frames / ~15.75 s;
- subject/world continuity was promising;
- the seam still showed a motion/camera-velocity discontinuity;
- later-chunk realism/detail may degrade, but this requires repeated tests before calling it systematic.

### Important CGlide mechanism correction

CGlide saves a strip of final handoff frames, but its current timeline continuation logic places one image anchor from the handoff set for the next render window. That means the generation is not receiving a full multi-frame motion history even though multiple handoff PNGs exist for overlap/assembly bookkeeping.

This is a plausible reason appearance continuity can work better than motion continuity.

## Lightricks official long-video sampler

The next comparison target is the official `Lightricks/ComfyUI-LTXVideo` package.

Its `LTXVLoopingSampler` is materially different from CGlide chunk handoff:

- it processes one long latent as overlapping temporal tiles;
- later tiles use `LTXVExtendSampler`;
- previous temporal output conditions the next tile through an explicit overlap;
- `temporal_overlap_cond_strength` controls continuation pressure;
- `adain_factor` is provided to reduce accumulated statistic/oversaturation drift;
- optional per-tile positive conditioning is available through `MultiPromptProvider`;
- optional negative-index latents can provide longer-term context;
- conditioning images/keyframes can also be used.

The official documentation recommends meaningful temporal overlap for long video rather than a zero-context restart.

This directly targets the two weaknesses seen in the CGlide baseline: motion seam quality and possible later-window visual drift.

## Three-track comparison

Helix Production will now compare:

```text
A. CGlide only
   timeline/director + single-anchor continuation + writer/assembler

B. Lightricks only
   temporal-overlap long-video sampling

C. Hybrid
   CGlide-style high-level directing mapped into Lightricks continuation, only if the interfaces fit cleanly
```

The hybrid should not be designed first. Standalone Lightricks behavior must be measured before adding integration complexity.

## Acceptance questions

For each track:

1. Does subject identity remain stable?
2. Does rider/wardrobe/object geometry remain stable?
3. Is the boundary visible?
4. Does camera velocity continue rather than reset?
5. Does subject motion continue rather than restart or freeze?
6. Does realism/detail degrade in later temporal sections?
7. Is there saturation/contrast drift?
8. How does runtime scale?
9. Does the method fit the current 8 GB VRAM + offload environment?
10. Is the control surface explicit enough for human review and later agent suggestions?

## Current recommendation

Do not build a custom Helix continuity engine yet.

Next sequence:

```text
CGlide baseline              DONE
Lightricks install/node test NEXT
Lightricks ~16 s comparison
Lightricks longer limit test
minimal hybrid proof
choose the simplest clear winner
```

If the standalone Lightricks sampler does not materially improve the result, return to CGlide and optimize its seam modes / continuation constraints. If Lightricks wins, use it as the continuation engine and decide separately whether any CGlide Director controls are worth adapting.
