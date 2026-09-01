# D1 Prompt Relay runtime test

**Status:** superseded as an execution checkpoint by later controlled Prompt Relay validation.

This file preserves the original D1 test design because it documents how the early LTX Director/Prompt Relay integration was intended to be isolated. Do **not** reinterpret this exact historical test as a recorded PASS unless an artifact/log for this specific D1 run is identified.

Later Production research did validate Prompt Relay behavior independently through controlled native-vs-Relay tests, including motorcycle sequencing, walk → stop/speak → run temporal ownership, an object-state stress test, and a longer café scene. The current conclusion is recorded in `PROMPT_RELAY.md` and `README.md`:

```text
Prompt Relay = temporal semantic routing / scene progression
```

not a hard timestamp controller or persistent object-state machine.

## Original D1 goal

Prove that the validated D0 LTX 2.5 backend responds to multiple **timed local prompts** through LTX Director Prompt Relay while holding the starting image, seed, model stack, and two-stage backend constant.

## Original test structure

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

At 24 fps the compiled Prompt Relay lengths were intended to be:

```text
60,72,60
```

Total: 192 requested frames. LTX may internally snap the sequence to its temporal requirements.

## Intended Director input

```text
global_prompt
    +
local_prompts = prompt A | prompt B | prompt C
segment_lengths = 60,72,60
```

The original Director UI treated the main timeline as source of truth and serialized timed segment prompts into hidden `local_prompts` and `segment_lengths` state.

## Historical pass condition

The specific D1 test would have passed if:

- Director received all three local prompts;
- Prompt Relay stopped using the single-prompt bypass;
- logs showed three temporal segments/effective lengths;
- both LTX stages completed;
- a playable video was saved;
- the output showed useful evidence of temporal behavior matching the requested phases.

Visual perfection was not required.

## Current interpretation

The broader question D1 was designed to answer has since been answered by later controlled Prompt Relay experiments. Therefore the next work should not repeat D1 merely to change this file's status.

Use new tests only when they target an unresolved question, such as backend timing compilation, combined reference conditioning + temporal routing, or a specific native failure class.
