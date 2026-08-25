# LTX Director

This folder is the Helix Production workspace for evaluating and integrating LTX 2.5 generation, native T2V behavior, CGlide Director-style controls, Prompt Relay, reference-conditioning systems such as Licon MSR, and long-video continuation backends.

It is **not** the Helix Director. Helix Director remains model/provider agnostic. This folder is about how Production compiles explicit generation intent into LTX/ComfyUI execution state.

## Proven local foundation

The workstation has validated:

- native/local LTX 2.5 two-stage I2V generation;
- native full-resolution single-stage LTX 2.5 I2V generation;
- native/local LTX 2.5 T2V generation with joint audio;
- controlled 5 s / 8 s / 10 s native T2V prompt experiments;
- native hard-cut multishot behavior from prose alone;
- CGlide LTX Director 2.5 wiring inside the native LTX graph;
- Kijai Prompt Relay running against native LTX 2.5 T2V with controlled temporal-region A/B tests;
- Prompt Relay scene-progression benefit in a clean 15-second native-vs-Relay comparison;
- appended image/keyframe guidance;
- CGlide chunk writing, handoff PNGs, audio joining and final assembly;
- official Lightricks `LTXVLoopingSampler` running locally over both LTX 2.5 stages.

Licon LTX 2.5 MSR has been researched and has a concrete local test plan, but is **not yet locally validated**.

## Native T2V quality baseline

Native T2V is now a real Production research baseline rather than an untested future path.

Controlled native outputs have been validated at:

```text
5 s  -> 121 frames @ 24 fps -> ~5.04 s
8 s  -> 193 frames @ 24 fps -> ~8.04 s
10 s -> 241 frames @ 24 fps -> ~10.04 s
output: 1280 x 704 from the current 16:9 / 0.9 MP two-stage workflow
```

The current research baseline keeps Prompt Enhance OFF and uses the same seeds/settings so prompt behavior can be studied independently.

Important findings:

- native LTX already performs substantial semantic/temporal planning without Director or Prompt Relay;
- vehicle + camera coordination, continuous world motion, human acting, performance scenes and dominant AV events are strong native territory;
- native hard cuts are real, but a cut is useful only when the shots have different jobs;
- exact multi-object collision geometry, strict physical causality, exact reflection geometry and dense low-level sub-action tracking remain weak;
- explicit visual post-state wording can improve persistence, but repeated logical constraints can reduce finished-video quality;
- 8 seconds is currently the strongest general research duration for richer native single shots; 5 seconds remains useful for compact ideas, while 10 seconds should be reserved for scenes that genuinely contain ten seconds of evolving action;
- evaluation must separate prompt/benchmark adherence from whether the final video actually looks coherent and directed.

See `NATIVE_T2V.md` for the full 5 s / 8 s / 10 s findings, prompt-design rules, audio observations, multishot behavior, Seedance reference context and the current native-vs-controlled test policy.

## Prompt Relay checkpoint

Kijai `ComfyUI-PromptRelay` is now locally validated with the native LTX 2.5 two-stage T2V graph.

The important architectural conclusion is:

```text
Prompt Relay != hard timestamp switch
Prompt Relay != object-state machine

Prompt Relay = temporal semantic routing / scene progression control
```

Controlled tests established:

- a motorcycle three-phase test showed modest reduction in temporal leakage where native LTX already understood the sequence well;
- a walk -> stop/speak -> run test showed much stronger concentration of the middle semantic event and earlier ownership of the final run region;
- a receive -> inspect/open -> discard envelope stress test showed that Relay does not solve fragile physical state/possession chains and can run out of region budget when too many sub-actions are packed into one segment;
- a clean 15-second cafe scene showed the real Production value: native LTX introduced later story content very early, while Relay gave the opening beat more room and reduced future-event leakage without obvious loss of long-shot coherence.

Current working role:

```text
simple focused short shot
-> native LTX first

longer shot with distinct semantic/narrative beats
-> consider Prompt Relay

strict physical-state causality
-> Relay alone is insufficient
```

For Relay compilation, persistent world/subject/camera/ambience belongs in the global prompt and changing beat-specific semantics belong in local prompts. Frame allocation and `epsilon` remain backend details.

See `PROMPT_RELAY.md` for exact tests, timing observations, workflow integration and Production policy.

## Licon MSR research checkpoint

Licon MSR V1 is a separate LTX 2.5 multi-reference control candidate.

Conceptually:

```text
Prompt Relay
-> WHAT happens WHEN

Licon MSR
-> WHO / WHAT referenced entities should remain visually consistent
```

The published LTX 2.5 system uses a dedicated MSR LoRA plus learned reference-slot embeddings and negative temporal reference positions. The current standalone ComfyUI plugin accepts up to five reference inputs (`pic1`..`pic4` + optional background) and documents a native two-stage LTX 2.5 integration where references are applied again after spatial latent upscale.

MSR is promising for recurring characters, wardrobe, objects/vehicles and background continuity, but it has not yet earned a Helix Production role. It must first pass one-subject and two-subject local tests on the current worker.

See `MSR_RESEARCH.md` for mechanism, plugin topology, model placement and the test plan.

## Current quality baseline — native full-resolution I2V

A bare-LTX F0 benchmark removed CGlide, Prompt Relay, Lightricks temporal tiling, secondary references, latent x2 upscaling and the second diffusion stage.

The portrait motorcycle test produced:

```text
4 s -> 97 frames  @ 24 fps
8 s -> 193 frames @ 24 fps
actual decoded size: 736 x 1280 after LTX dimension snapping
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
1280 x 704
~15.04 s
566.36 s runtime
```

Subject consistency and motion continuity were better than the first CGlide single-image handoff baseline. The remaining weakness was gradual world/lighting drift between temporal windows.

Lightricks is treated primarily as a **temporal-extension engine**, not the default backend for every short shot.

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
focused shot fits comfortably in one native generation
-> native LTX first

rich native T2V single shot
-> 8 s / 24 fps is the current research sweet spot

identity/detail-critical I2V short shot
-> full-resolution native LTX is a validated candidate

multiple distinct semantic/narrative beats within one generation
-> Prompt Relay is a validated temporal-routing candidate

reference-critical recurring character/object appearance
-> Licon MSR is the next independent experiment; not yet validated

long continuous extension
-> Lightricks LoopingSampler

explicit timed direction
-> compile Director intent into backend-compatible timing
```

Do not add Prompt Relay or future MSR references automatically to shot types that native LTX already executes well. The goal is the lightest reliable Production path, not the most complicated graph.

This remains experimental Production policy, not a frozen Helix schema.

## Relevant notes

- `NATIVE_T2V.md` — native 5/8/10-second T2V benchmark and quality findings;
- `PROMPT_RELAY.md` — validated Kijai Relay A/Bs and scene-progression role;
- `MSR_RESEARCH.md` — researched Licon LTX 2.5 MSR mechanism and local test plan;
- `FULL_RES_NATIVE_I2V.md` — locally validated bare full-resolution motorcycle baseline;
- `LONG_VIDEO_COMPARISON.md` — continuation tracks, failure analysis and test order;
- `HYBRID_B_V1.md` — failed hybrid history and re-entry constraints;
- `CGLIDE_CHUNKING.md` — proven CGlide handoff baseline;
- `LIGHTRICKS_LOOPING.md` — Lightricks role, implementation and calibration notes;
- `INSTALL.md` — workstation/custom-node setup;
- `DIRECTOR_SHOT.md` — temporary Production-side test contract.

## Architecture boundary

The current ComfyUI graphs are execution prototypes, not the final agent-facing interface.

Useful Production controls may eventually include global/timed prompts, duration/fps/dimensions, prompt enhancement, image/reference assets and strengths, motion controls, retake/extension policy, seed and backend execution settings.

The native T2V and Prompt Relay tests suggest that the eventual semantic interface should preserve distinctions between:

```text
world state
main action
camera intent
temporal beats
persistent state
causal transition
reference / continuity entities
audio intent
```

Backend-specific details should remain behind a Production adapter until experiments show which controls deserve to become stable Helix concepts.
