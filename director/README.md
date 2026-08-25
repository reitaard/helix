# Director

Director is the creative decision layer. It consumes Intelligence and decides what content should be made and how the idea should function creatively.

## Candidate skills

- concept;
- hook;
- narrative / information timing;
- pacing;
- visual direction;
- audio direction;
- format adaptation;
- critic.

These should remain separable skills even if some are implemented by the same model initially.

## Output

Working boundary: `ContentSpec`.

A ContentSpec may eventually describe the topic, angle, audience, hook, narrative beats, target duration, visual/audio intent, constraints, references, and experiment-relevant labels.

## Production handoff

Director may express production-relevant intent such as beats, timing, continuity, references, camera intent, persistent state, causal transitions, and audio intent. Translation into model settings, workflow graphs, timeline JSON, keyframe strengths, IC-LoRAs, retake masks, prompt-relay regions, or provider-specific parameters belongs to Production.

The recent native LTX 2.5 T2V experiments reinforce this boundary: the Director should describe what must happen creatively, while Production decides whether a focused native prompt is enough or whether the shot needs stronger tool-specific timing/control.

## Naming clarification

Helix Director is not LTX Director. LTX Director is a tool-specific production control surface that may be used by a Production adapter. Helix Director must remain useful when that backend is replaced.

## Hard boundary

Director must not care whether Production later uses LTX, Seedance-class systems, Wan, H3, stock footage, motion graphics, a human editor, or another open/future production method.

The current Production research direction is open/self-hosted first, but that is an execution choice rather than a dependency of the Director contract.
