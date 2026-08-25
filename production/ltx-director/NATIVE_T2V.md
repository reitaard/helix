# Native LTX 2.5 T2V findings

This note records the controlled native LTX 2.5 text-to-video experiments run on the Helix RTX 4060 worker before adding LTX Director, Prompt Relay, image conditioning, or long-video continuation controls.

The purpose is not to freeze one workflow forever. It is to preserve what native LTX can already do well, where it fails, and which failures are worth solving with Production-side control layers instead of prompt rewriting alone.

## Experimental boundary

All findings here come from the official/native LTX 2.5 T2V workflow family with:

```text
model:          LTX 2.5 22B distilled INT8 ConvRot
text encoder:   Gemma 4 12B with LTX projection
video VAE:      LTX 2.5 BF16
audio VAE:      LTX 2.5 BF16
latent upscale: LTX 2.5 x2 BF16
fps:            24
aspect:         16:9
resolution:     0.9 MP selector -> 1280x704 output
prompt enhance: OFF
main seed:      558811532553686
stage-2 seed:   42
```

The first benchmark family intentionally changed only the positive prompt. Later retests changed duration and prompt wording to explore practical native quality rather than strict single-variable attribution.

Native frame counts observed:

```text
5 s  -> 121 frames -> ~5.04 s
8 s  -> 193 frames -> ~8.04 s
10 s -> 241 frames -> ~10.04 s
```

The runtime's current Telegram T2V binding may still keep 5 seconds as a fixed operational default until the settings contract is designed. That is separate from the experimental conclusion below that 8 seconds is currently the strongest general-purpose native test duration for richer single-shot scenes.

## What the tests established

Native LTX 2.5 already performs substantial temporal interpretation without external directing controls.

Observed native behavior includes:

- chronological action allocation from ordinary prose;
- coherent continuous camera movement;
- camera + moving-subject coordination;
- strong short-horizon subject and object identity;
- synchronized dominant audio events;
- native hard cuts when explicitly requested;
- useful cross-shot wardrobe/style/character continuity;
- semantic prioritization when a prompt contains more instructions than the clip can comfortably execute.

This invalidates the simplistic model:

```text
native LTX = dumb generator
Director   = all temporal intelligence
```

A better working model is:

```text
prompt
  -> semantic interpretation
  -> native temporal allocation
  -> camera/action planning
  -> joint audiovisual generation
```

External Director/Prompt Relay controls should therefore be added only where native behavior is insufficient or needs tighter timing, not as mandatory layers for every shot.

## Duration findings

### 5 seconds

Strengths:

- compact and energetic;
- works well for a small number of beats;
- some transitions looked more natural because the model had to keep momentum.

Weaknesses:

- can skip intermediate physical/object states;
- can run out of temporal budget;
- complex sequences become compressed.

### 8 seconds

Current best general native test duration for richer single-shot scenes.

Strengths:

- enough time for a real cinematic arc;
- less rushed than 5 seconds;
- less temporal dilation than the 10-second retests;
- produced the strongest overall quality-oriented batch.

This is an experimental baseline, not yet a frozen Helix runtime default.

### 10 seconds

Usable when the concept genuinely contains enough evolving action to justify ten seconds.

Observed risk: the model may stretch the same internal story over the longer duration rather than use the additional time to execute more requested events.

The bus retest showed approximately the same conceptual beat order as the 5-second version, but spread across twice the time. Extra duration alone did not guarantee completion of the final bus-stop state.

Working rule:

```text
5 s  -> compact/high-motion ideas
8 s  -> default native research duration for richer single shots
10 s -> only when the scene itself genuinely needs ten seconds
```

Do not treat duration as a sequencing solution by itself.

## Prompting findings

### Prefer natural causal motion over state-machine prose

Over-constrained wording such as:

```text
finish speaking
ONLY THEN turn
```

produced robotic acting in the 10-second bus test.

More natural overlap such as:

```text
she recognizes the bus, begins turning toward it while speaking, and follows it with her eyes
```

produced a better 8-second result.

Use `as`, `while`, `then`, and physical verbs to express continuous motion. Avoid artificial hard boundaries unless the boundary is creatively essential.

### Describe the desired visual result, not only the logical constraint

Repeated logical constraints improved some state persistence but could damage visual quality.

The bottle tests showed:

```text
"broken pieces"
```

could become chunky symbolic debris, while explicitly asking for:

```text
small irregular transparent shards,
fine splinters,
larger curved pieces
```

materially improved the shattered-glass appearance.

For visual phenomena, describe what the desired result should look like.

### Explicit post-state wording can help persistence

The first bottle test allowed an intact bottle-like object to persist/reform after a shatter event.

A later prompt explicitly stated that after impact the original bottle was completely destroyed and only shattered glass and spilled liquid remained. That substantially improved the irreversible post-state.

However, exact collision geometry and multi-object causality still failed. Prompting can improve persistent semantic state without turning LTX into a rigid-body simulator.

### Keep prompts focused

The strongest quality-oriented 8-second prompts were roughly 120-150 words and centered on one main visual idea.

Earlier diagnostic prompts around 230-260 words were useful for stress testing but often contained too many equally emphasized instructions.

Working Production guidance:

```text
one main visual idea
+ one evolving action arc
+ clear camera language
+ relevant audio
+ only essential continuity constraints
```

Do not spend the prompt budget repeating negatives or describing low-priority details at the same semantic weight as the main action.

Prompt Enhance remains OFF for the current native baseline so prompt-writing quality can be evaluated independently. Prompt Enhance should later be tested as its own controlled A/B layer.

## Capability profile

### Strong native territory

- continuous cinematic single shots;
- one dominant rigid subject moving through an environment;
- vehicle + camera coordination;
- motorcycle/vehicle POV and forward-world motion;
- human facial stability in moderate camera changes;
- subtle human acting when actions flow naturally;
- performance/music scenes;
- dominant audiovisual events;
- semantic chronology;
- native hard cuts;
- cross-shot wardrobe/style/character continuity.

Best quality-oriented examples from the 8-second batch:

```text
sports-car coastal tracking shot -> strongest complete native result
singer performance              -> strong audiovisual/performance result
cafe acting/dialogue             -> excellent visual acting, weak subtle ambience
motorcycle mountain POV          -> credible continuous T2V vehicle world
train-station multishot          -> good visual edit, weak audio
```

### Still weak or unreliable

- exact multi-object collision geometry;
- strict physical causality across several interacting objects;
- exact optical/reflection geometry over changing viewpoints;
- satisfying every low-level sub-action in a dense prompt;
- guaranteed final-state completion;
- strict stationary-camera obedience when the model prefers a more useful composition;
- precise pre/post-cut causal setup;
- subtle continuous ambience.

A useful summary from the physics tests is:

> Native LTX is often better at understanding which semantic event should happen next than at preserving every physical fact required to make that event happen exactly.

## Audio findings

Audio quality is not uniformly strong across scene types.

Dominant sound sources were generally successful:

- motorcycle engine/wind/road;
- sports-car engine/road;
- singer voice/music;
- discrete impact/contact events;
- visible speech events.

Subtle ambience was less reliable:

- quiet cafe rain/dishes/room tone could become very weak;
- the train-station multishot produced almost no meaningful requested footsteps/rain/train ambience despite strong visuals.

Do not assume "audio present" means the requested sound design is complete. Evaluate dominant events and ambient beds separately.

## Multishot findings

Native hard cuts are real and were repeatedly observed without Prompt Relay or Director controls.

However, a requested cut is not automatically a useful edit.

Bad pattern:

```text
same situation
-> hard cut
-> closer version of the same situation
```

Better pattern:

```text
shot 1 = movement / geography / discovery
-> hard cut
shot 2 = reaction / payoff
```

Each shot should have a distinct job. Re-identify important recurring subjects, but do not over-specify identity so aggressively that the model spends the temporal budget merely holding a face instead of executing the scene.

## Benchmark adherence vs video quality

All future evaluations should score two different things:

```text
BENCHMARK ADHERENCE
Did the model satisfy the requested events/states?

VIDEO QUALITY
Does the clip actually feel coherent, natural, directed, and usable?
```

The experiments showed that a prompt can improve benchmark adherence while making the resulting video worse.

Examples:

- 10-second bus: clearer ordered states, worse acting transition;
- 10-second bottle: better persistent destroyed state, worse shattered-glass appearance;
- 10-second identity test: strong face continuity, weak overall 10-second story/editing.

Production decisions should optimize usable video quality, not clause-by-clause obedience alone.

## Artifact evaluation rule

Model evaluation must use the native Comfy artifact whenever possible.

During the first comparison pass, Telegram-delivered copies were observed at approximately:

```text
930x512 / ~30 fps / 151 frames
```

while the native files were:

```text
1280x704 / 24 fps / 121 frames for the same 5-second runs
```

That transport/transcode difference was large enough to contaminate motion/detail evaluation. The runtime's intended path is Telegram `sendDocument` original-file delivery; keep verifying that path end-to-end and do not benchmark from a transformed preview.

## Seedance reference context

Seedance 2.0 is currently a behavioral reference, not an active Production provider.

The existing motorcycle Seedance T2V example demonstrates strong long-horizon world synthesis and autonomous temporal interpretation, but it also promoted strongly described landslide context into an unwanted narrative event despite instructions that nothing major should happen.

The relevant lesson for Helix is not "copy Seedance timestamps." It is to distinguish:

```text
REFERENCE / IDENTITY LOCK
WORLD STATE
ACTION
TEMPORAL PLAN
PERSISTENT STATE
CAUSAL TRANSITION
```

Native LTX already has meaningful internal temporal planning. The later Seedance comparison should therefore ask where Seedance gains quality/continuity and where it becomes more autonomous than desired.

## Production policy implied by the tests

Use native LTX first when a shot fits its proven comfort zone:

```text
focused subject
+ coherent environment
+ continuous evolving motion
+ straightforward camera intent
```

Do not automatically add Director/Prompt Relay to successful native shot types.

Escalate to Production control layers when the creative requirement needs:

- explicit timed transitions;
- multiple shots with strict responsibilities;
- events native LTX repeatedly drops;
- controlled state changes;
- longer structured progression;
- tighter temporal allocation than natural-language prompting provides.

This keeps Helix Director provider-agnostic while Production chooses the lightest backend control surface that can reliably execute the intent.

## Next experiments

The next useful sequence is:

1. preserve 8-second native T2V as the quality-oriented research baseline;
2. test Prompt Enhance ON vs OFF as a controlled preprocessing experiment;
3. test LTX Director / Prompt Relay only on problems native prompting cannot reliably solve;
4. compare native vs controlled versions using both adherence and finished-video quality;
5. only then revisit longer structured generation and the Seedance motorcycle reproduction.

Do not jump directly to 15-20 second native tests while the 8-second native/controlled boundary is still being learned.
