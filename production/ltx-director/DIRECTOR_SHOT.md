# Tiny DirectorShot v0

`DirectorShot` is a temporary Production-side test contract. It is intentionally small and must not be treated as the final Helix `ContentSpec` or shared schema.

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
    "workflow_version": "v0"
  }
}
```

## v0 rules

- The trigger is not part of `DirectorShot`; a trigger only asks the worker to run a prepared shot.
- `global_prompt` describes persistent scene/camera/style/continuity constraints.
- `segments` describe chronological local actions. Start with one segment, then test 2-3 segments after the baseline succeeds.
- `guides[0]` is the starting image for the first I2V test.
- Generation settings stay separate from creative intent so later experiments can change execution without rewriting the shot.
- LTX Director-specific `timeline_data`, `local_prompts`, `segment_lengths`, guide strengths, and Comfy node IDs are adapter output, not fields agents should write directly.

## First success criterion

A manual test payload can be compiled into a known LTX Director workflow, submitted through the ComfyUI API, and produce a retrievable video while preserving:

- original `DirectorShot`;
- compiled workflow version;
- seed and model settings;
- Comfy prompt/job id;
- status;
- output path/metadata;
- runtime.

Do not add IC-LoRA, retake, extension, audio, automated QA, or n8n until this path is reproducible.
