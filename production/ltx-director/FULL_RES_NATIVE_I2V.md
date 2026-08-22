# Native Full-Resolution LTX 2.5 I2V

**Status:** locally validated baseline  
**Scope:** Production experiment only; not a Helix-wide contract.

## Why this path was tested

A community LTX 2.5 workflow discussion suggested that demanding I2V shots can retain more detail when sampling directly at final spatial resolution instead of using the normal:

```text
low-resolution Stage 1
    ↓
latent ×2 upscale
    ↓
short final-resolution Stage 2
```

The hypothesis is most relevant when the model must synthesize geometry or fine detail that was not fully visible in the source frame.

This claim was treated as a hypothesis until a local bare-LTX test was run.

## Local F0 setup

The F0 motorcycle test intentionally removed every extra temporal/control layer:

```text
single source image
    ↓
native LTX 2.5 I2V conditioning
    ↓
full-resolution latent from the first diffusion stage
    ↓
single native distilled sampling pass
    ↓
decode
```

Not used:

- CGlide Director;
- Prompt Relay;
- Lightricks `LTXVLoopingSampler`;
- temporal tiles / overlap;
- second visual reference;
- latent ×2 upscaler in the executed path;
- second diffusion stage.

Input was a photorealistic green sport motorcycle/rider image in portrait composition. The prompt requested restrained forward riding, a nearly fixed front-three-quarter tracking camera, realistic wheel/suspension motion, crisp materials, and no deliberate heavy blur or viewpoint choreography.

Key settings:

```text
requested canvas       704 × 1280 portrait
actual decoded width   736 × 1280 after LTX dimension snapping
fps                    24
Prompt Enhance         OFF
native I2V strength    0.70
fixed seed             same across duration comparison
```

## Local result — 4-second run

```text
97 frames
24 fps
736 × 1280 decoded
```

Observed:

- exact motorcycle identity remained strong;
- rider/helmet/gear remained coherent;
- no duplicate motorcycle;
- no subject disappearance;
- no replacement motorcycle;
- gross fairing/headlight/windscreen geometry remained recognizable;
- photographic materials and road motion were strong;
- composition changed more aggressively than requested, with the motorcycle growing/drifting in frame toward the end;
- small decals/logos and very fine surface details still morphed.

Overall: **PASS as a native full-resolution quality baseline.**

## Local result — 8-second duration control

The second run changed duration while keeping the same source, prompt family, seed, resolution path and native full-resolution architecture.

```text
193 frames
24 fps
736 × 1280 decoded
```

Observed:

- the same green motorcycle and rider survived the full 8 seconds;
- no catastrophic identity replacement occurred;
- no duplicate subject appeared;
- fairing/headlight/windscreen identity remained stable at the gross-geometry level;
- rider consistency remained strong;
- framing was actually more stable than the 4-second trajectory;
- fine decals/logos and tiny mechanical/surface details still drifted;
- minor fine-detail drift did not escalate into whole-object identity collapse.

Important finding: changing temporal duration changed the generated trajectory from the beginning. The first four seconds of the 8-second result were not simply the 4-second result followed by four new seconds. Duration is therefore a generation variable, not just an output-length extension.

Overall: **PASS for an 8-second native full-resolution motorcycle shot under restrained motion.**

## What this does and does not prove

Locally supported now:

- native full-resolution LTX 2.5 can preserve a detailed motorcycle/rider convincingly for at least 4–8 seconds when the camera/motion request stays physically modest;
- the catastrophic replacement-bike failure seen in Hybrid B is not an unavoidable property of LTX 2.5 itself;
- extra temporal/control layers are unnecessary for a short shot that already fits comfortably in one native generation;
- micro-detail persistence is weaker than gross subject identity persistence.

Not yet proven:

- full-resolution is always better than the normal two-stage path;
- full-resolution fixes large viewpoint-change identity problems;
- full-resolution remains stable at 15–30+ seconds;
- logos/decals can be preserved exactly by prompting alone;
- the same behavior generalizes to every subject class.

A direct same-image/same-prompt two-stage A/B would still be required to quantify the quality advantage of full-resolution sampling itself.

## Remaining weaknesses worth tuning later

### Micro-detail persistence

Logos, decals, tiny text, reflections and very small mechanical details can morph even when the motorcycle identity remains intact.

For Production, small localized errors should not force the entire generation graph to become more complicated. Masked repair/inpainting or targeted post-processing may be cheaper and safer than over-conditioning the whole shot.

### Composition drift

Native LTX can slowly change subject scale or framing even with a stable-camera prompt. Later tests can isolate prompt wording, I2V strength and camera-control mechanisms, but only one variable should change at a time.

### Late-frame detail / surface fidelity

Fine texture can become slightly less exact over time even while gross identity remains strong. This is a quality-tuning problem, not currently an identity-collapse problem.

## Production implication

Current provisional role split:

```text
short / medium shot fits native duration
    → native LTX first

identity/detail-critical short shot
    → full-resolution native LTX is now a validated candidate

long continuous extension beyond comfortable native duration
    → Lightricks LoopingSampler

explicit timed shot direction
    → CGlide/Director intent, but only with temporal mapping compatible with the selected generation backend
```

Do not add Lightricks merely because it exists, and do not add CGlide merely to improve identity. CGlide's old 2.3 reference-sheet behavior is disabled for LTX 2.5; it is not the current identity-reference solution.

## Next experiment boundary

The next hybrid experiment should preserve the strong native baseline rather than rebuilding everything at once.

Rules:

1. keep the successful motorcycle source and restrained physical motion class;
2. treat native full-resolution output as the quality baseline;
3. introduce Lightricks only when testing actual temporal extension;
4. use CGlide as a Director/control source, not as a fake identity-reference layer;
5. do not directly reapply full-duration Prompt Relay inside LoopingSampler until tile/global time alignment is solved;
6. prefer translating Director intent into Lightricks tile-aware positive conditioning for the first hybrid re-entry;
7. change one control variable at a time;
8. judge exact motorcycle identity before aesthetics.
