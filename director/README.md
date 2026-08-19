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

## Hard boundary

Director must not care whether Production later uses Seedance, Wan, H3, Runway, stock footage, motion graphics, a human editor, or another tool.