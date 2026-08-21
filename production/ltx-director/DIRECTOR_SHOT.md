# Tiny DirectorShot v0

`DirectorShot` is a temporary Production-side test contract. It is intentionally small and must not be treated as the final Helix `ContentSpec`, `ProductionPlan`, or shared schema.

## Shape

```json
{
  "duration_seconds": 8,
  "fps": 24,
  "global_prompt": "",
  "segments": [
    {
      "start_seconds": 0,
      "end_seconds": 8,
      "prompt": ""
    }
  ],
  "guides": [
    {
      "at_seconds": 0,
      "image": ""
    }
  ],
  "generation": {
    "seed": 0,
    "width": 1280,
    "height": 704,
    "backend": "ltx-director-comfyui",
    "workflow_version": "d0"
  }
}
```

## Separation of concerns

```text
TRIGGER
run this prepared shot

INPUT
what should happen

EXECUTION CONFIG
how this backend should manufacture it
```

The trigger is not part of `DirectorShot`.

## Current D0 adapter mapping

The mapping is now concrete enough to test, but still provisional:

| DirectorShot intent | LTX Director / Comfy target |
| --- | --- |
| `global_prompt` | `LTXDirector.global_prompt` |
| starting image | image segment in `timeline_data.segments` with `type: image`, `imageFile`, `start`, `length` |
| segment prompts | `timeline_data` + hidden `local_prompts` / `segment_lengths` compiled by the adapter |
| `duration_seconds` / `fps` | Director timing/frame-rate state |
| guide strength | Director guide state |
| `generation.seed` | sampler noise seed, outside the creative timeline |
| backend/model parameters | workflow adapter configuration, not DirectorShot creative fields |

The current D0 test intentionally uses a single global prompt, so Prompt Relay attention masking is bypassed by the Director backend. Timed local segments will be the next test after D0 succeeds.

## D0 manual-input convenience

For the current local test workflow, the existing outer LTX 2.5 `prompt` field is wired directly to `LTX Director → global_prompt`.

The starting motorcycle source image is represented as a Director timeline image segment at frame 0. This is a test convenience; the future compiler should generate that timeline state from `guides[0]` rather than relying on a hard-coded filename.

## v0 rules

- `global_prompt` describes persistent scene/camera/style/continuity constraints.
- Start with one prompt; test 2-3 chronological local segments only after D0 succeeds.
- `guides[0]` is the starting image for the first I2V test.
- Generation settings stay separate from creative intent so experiments can change execution without rewriting the shot.
- LTX Director-specific `timeline_data`, `local_prompts`, `segment_lengths`, guide strengths, hidden UI state, and Comfy node IDs are **adapter output**, not fields upstream Helix agents should write directly.

## First success criterion

A manual test payload can be compiled into the known D0 Director workflow, submitted through ComfyUI, and produce a retrievable video while preserving:

- original `DirectorShot`;
- compiled workflow version;
- seed and model settings;
- Comfy prompt/job id;
- status;
- output path/metadata;
- runtime.

Do not add IC-LoRA, retake, extension, custom audio, automated QA, or n8n until this direct path is reproducible.
