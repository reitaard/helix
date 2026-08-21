# D1 Prompt Relay runtime test

**Status:** ready to run; result pending.

## Goal

Prove that the validated D0 LTX 2.5 backend responds to multiple **timed local prompts** through LTX Director Prompt Relay.

D1 changes only the prompt structure. Keep the same starting image, seed, model stack and two-stage backend so the comparison is useful.

## Test structure

Global prompt contains persistent shot constraints such as subject identity, live-action camera style, motorcycle geometry, road physics and daylight.

Timed local prompts:

```text
0.0-2.5 s
The rider holds a shallow right lean while the tracking camera maintains a steady distance.

2.5-5.5 s
The rider commits to a visibly deeper right-hand lean through the curve; the horizon tilts naturally with the motorcycle.

5.5-8.0 s
The motorcycle progressively straightens on exit and accelerates forward while the camera continues tracking.
```

At 24 fps the compiled Prompt Relay lengths are:

```text
60,72,60
```

Total: 192 requested frames. LTX may internally snap the generated sequence to its temporal requirements.

## What Director should receive

```text
global_prompt
    +
local_prompts = prompt A | prompt B | prompt C
segment_lengths = 60,72,60
```

The current Director UI treats the main timeline as source of truth and serializes timed segment prompts into the hidden `local_prompts` and `segment_lengths` widgets.

When more than one local prompt is present, Prompt Relay should stop using the D0 single-prompt bypass and build temporal attention masks for the segments.

## Run procedure

1. Import the prepared D1 Prompt Relay workflow as a separate workflow.
2. Confirm the same motorcycle source image is available.
3. Do not change the seed, model stack, samplers, guide topology or advanced Director features.
4. Confirm Director is still `1280x704`, 8 s, 24 fps.
5. Queue exactly one generation.
6. Capture the log lines beginning with `[PromptRelay]`, especially segment/token/latent information.
7. Save the output and generation time.

## Pass condition

D1 passes when:

- Director receives all three local prompts;
- Prompt Relay does not report the single-prompt bypass;
- logs show three temporal segments / effective lengths;
- both LTX stages finish;
- a playable video is saved;
- the output shows at least useful evidence of temporal behavior corresponding to the three requested phases.

Visual perfection is not required for D1. The purpose is to prove controllable temporal prompt routing.

## Design boundary

This test precompiles Director state for convenience. It is **not** the final Production/agent control interface.

Next design work should expose Director controls explicitly so a human or agent can inspect, propose, replace and override values before the adapter serializes them into LTX-specific timeline state.
