# Prompt Relay findings — LTX 2.5

This note records the controlled Kijai `ComfyUI-PromptRelay` experiments run against the native LTX 2.5 two-stage T2V workflow on 2026-08-25.

The goal was to determine what Prompt Relay actually contributes beyond native LTX temporal understanding, and where its usefulness stops.

## Implementation under test

Custom node:

```text
kijai/ComfyUI-PromptRelay
commit tested: ca5d4e3
node: Prompt Relay Encode
```

The working LTX 2.5 integration is deliberately minimal:

```text
native LTX model
native Gemma text encoder
native EmptyLTXVLatentVideo
        ↓
Prompt Relay Encode
        ├── patched MODEL -> both native LTX sampling stages
        └── positive CONDITIONING -> native LTXVConditioning

native negative CLIPTextEncode -> native LTXVConditioning
```

Prompt Enhance remained OFF.

For LTX, Kijai patches both video cross-attention (`attn2`) and audio cross-attention (`audio_attn2`). The Relay node reads the target latent temporal geometry and applies additive temporal penalties to local-prompt token attention outside the intended region.

The same Relay-patched model can feed both stages of the current spatial-upscale workflow because stage 2 changes spatial resolution but not the video timeline. The attention mask reads the current spatial grid dynamically during execution.

## Mental model

Prompt Relay should **not** be treated as a hard timestamp switch or a state machine.

Useful model:

```text
global prompt
    = persistent world / subjects / camera language / ambience

local prompt A
local prompt B
local prompt C
    = semantic beats that should dominate different temporal regions

Prompt Relay
    = temporal semantic routing
```

It encourages:

> this semantic event belongs mostly here, not everywhere in the clip.

It does not guarantee:

```text
frame 60 -> action A must stop instantly
frame 61 -> action B must begin instantly
```

The boundaries are intentionally soft so neighboring actions can transition naturally.

## Controlled settings

The clean A/B tests held these values fixed unless a duration-specific test required otherwise:

```text
model:          LTX 2.5 22B distilled INT8 ConvRot
text encoder:   Gemma 4 12B with LTX projection
video VAE:      LTX 2.5 BF16
audio VAE:      LTX 2.5 BF16
latent upscale: LTX 2.5 x2 BF16
fps:            24
resolution:     1280x704 native artifact
prompt enhance: OFF
main seed:      558811532553686
stage-2 seed:   42
sampler:        euler_ancestral
video CFG:      1
audio CFG:      1
Relay epsilon:  0.001
```

All evaluation used native Comfy artifacts.

## Test 1 — motorcycle lean schedule

First exploratory output:

```text
Relay output 00001
8 s / 193 frames
segments: 60,72,60
```

The first prompt asked for helmet POV plus shallow lean -> deep lean -> straighten/accelerate. LTX chose an external front-facing rider view instead of helmet POV, making the lean phases harder to judge.

Conclusion: technically valid Relay execution, but poor benchmark design. Do not infer Relay failure from this run.

The test was rewritten so lean-state changes were clearly visible in an external rear three-quarter tracking view.

Clean comparison:

```text
native: 00031
Relay:  00003
8 s / 193 frames
segments: 60,72,60
intended regions:
0.0-2.5 s   upright
2.5-5.5 s   deep right lean
5.5-8.0 s   straighten + accelerate
```

Findings:

- native LTX already understood the three-stage chronology very well;
- the first transition was similar in both versions;
- native allowed the deep-lean action to leak later into the third region;
- Relay recovered from the lean closer to the requested second boundary;
- Relay did not visibly damage overall subject/world continuity;
- audio timing was good in both and did not show a decisive Relay advantage.

Interpretation: Relay provided a real but modest improvement where native LTX was already strong.

## Test 2 — walk -> stop/speak -> run

Clean comparison:

```text
native: 00032
Relay:  00004
8 s / 193 frames
segments: 60,72,60
intended regions:
0.0-2.5 s   walk
2.5-5.5 s   stop + hand gesture + "Wait!"
5.5-8.0 s   run
```

This was a stronger Relay benchmark because each region had a distinct semantic behavior.

Observed pattern:

```text
                 native          Relay
walking stops    ~3.2-3.5 s      ~3.2-3.5 s
hand raise       ~4.7 s          ~4.2 s
"Wait!" event    ~4.77 s         ~4.00 s
hand lowers      ~6.7 s          ~5.25-5.5 s
run begins       ~7.0 s          ~6.25 s
clear running    ~7.25 s         ~6.5 s
```

The first boundary was not materially better, but the middle semantic event was much more concentrated in its intended region. The strongest Relay speech event landed almost exactly around the middle of the second region.

Native understood all actions but allowed the middle behavior to bleed forward. Relay reduced that leakage and gave the final run more temporal ownership.

This is strong evidence that Prompt Relay can improve **temporal event allocation** without requiring hard cuts or external keyframes.

## Test 3 — receive -> inspect/open -> crumple/discard

Clean comparison:

```text
native: 00033
Relay:  00005
8 s / 193 frames
segments: 60,72,60
```

This intentionally stressed object state and causal continuity:

```text
no envelope
-> receive sealed envelope
-> inspect same envelope
-> open it
-> crumple it
-> throw it away
-> hands empty
```

Findings:

- both versions received and handled an envelope-like object;
- both began inspection earlier than the nominal 2.5-second boundary;
- opening/tearing remained approximate;
- Relay spent much of the final region on crumpling/handling;
- Relay did not clearly complete the throw/discard;
- Relay ended with visible paper still in hand;
- native reached an empty-hands final state more successfully in this particular run.

This does **not** show that Relay is globally worse. It exposes a different limitation:

```text
Prompt Relay
-> controls when semantic instructions dominate

Prompt Relay
-X-> does not maintain an explicit physical state machine
```

The final Relay region also contained too many physical sub-actions for 2.5 seconds. Native can cheat by smearing actions across neighboring time; Relay intentionally removes some of that freedom.

Working conclusion: temporal localization needs a realistic temporal budget. Do not pack five physical transitions into a short Relay region and then interpret incomplete execution as proof that routing itself failed.

## Test 4 — 15-second narrative scene progression

This was the decisive scene-development test.

Clean comparison:

```text
native: 00034
Relay:  00006
15 s / 361 frames
segments: 96,96,96,72
intended regions:
0-4 s    woman waits alone in cafe
4-8 s    man enters; she notices him
8-12 s   man approaches and sits
12-15 s  eye contact; tension softens; she smiles
```

The global Relay prompt contained only the persistent woman/cafe/rain/camera/ambience state. The man was intentionally absent from global conditioning and introduced only by later local beats.

Native behavior:

- the man appeared around ~1.25-1.5 s, long before his intended beat;
- his approach began around ~5.5-6 s, before the nominal 8-second approach region;
- the full story was understood, but future events were pulled forward and stretched across the clip.

Relay behavior:

- the opening woman-alone beat was substantially longer;
- the man remained absent until roughly ~2.25-2.5 s before beginning a soft transition into the arrival beat;
- the meaningful approach developed later, around ~6.5-7 s;
- sitting landed around ~11.75-12.25 s;
- the final face-to-face emotional payoff had real room to exist through the end;
- subject, cafe, lighting and long-shot coherence remained strong.

Prompt Relay did not create hard 4.000 / 8.000 / 12.000 second walls, but it clearly reduced future-event leakage into the opening and improved the sense that the scene **developed over time**.

This is the strongest current reason to keep Prompt Relay in Helix Production.

## Validated role

Prompt Relay is now locally validated for **temporal semantic control / scene progression** in LTX 2.5.

Good use cases:

```text
walk -> stop -> run
look -> speak -> turn away
wait -> arrival -> approach -> payoff
calm -> react -> leave
performance/dialogue beats
longer single-generation scenes with distinct narrative phases
```

Especially useful when native LTX understands every requested event but exposes later concepts too early or smears all events across the full duration.

## Not validated as a solution for

- exact frame-level switching;
- rigid-body physics;
- collision geometry;
- exact hand-object geometry;
- sealed -> opened -> destroyed object state machines;
- precise possession transfer;
- irreversible physical state guarantees;
- reflection/optical geometry.

Those remain separate Production problems.

## Production policy

Current working escalation:

```text
simple focused 5-8 s shot
-> native LTX first

longer shot with one naturally evolving action
-> native LTX may still be sufficient

single generation with distinct narrative/behavioral beats
-> consider Prompt Relay

strict object/state causality
-> Relay alone is insufficient

longer than a comfortable single LTX generation
-> continuation/LoopingSampler between chunks
   + Relay or tile-aware temporal prompting inside chunks when useful
```

Prompt Relay should be understood as a **scene progression controller**, not a universal Director replacement.

## Helix compilation implication

A future Production prompt compiler can preserve this distinction:

```text
persistent_state
  -> Relay global prompt

temporal_beats[]
  -> Relay local prompts + backend frame allocation

physical/state constraints
  -> separate control/reference/retake strategy where needed
```

Upstream Helix Director should remain provider-agnostic. Segment frame counts, `epsilon`, attention masks and node wiring remain backend adapter details.

## Next control experiment

Prompt Relay is sufficiently validated for its intended role. Do not burn more runs proving the same point.

Next independent experiment: **Licon MSR for LTX 2.5**, focused on multi-reference subject/object identity consistency. Test MSR independently before combining it with Prompt Relay.
