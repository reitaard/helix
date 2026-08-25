import {
  aspectOption,
  effectiveMegapixels
} from "./settings.js";

import type {
  ResolvedT2VSettings
} from "./settings.js";

export type T2VWorkflow =
  Record<
    string,
    Record<string, unknown>
  >;

function inputsFor(
  workflow: T2VWorkflow,
  nodeId: string,
  classType: string
) {
  const node =
    workflow[nodeId];

  if (
    !node ||
    node.class_type !==
      classType
  ) {
    throw new Error(
      `T2V node ${nodeId} is missing or changed`
    );
  }

  const inputs =
    node.inputs;

  if (
    inputs === null ||
    typeof inputs !== "object" ||
    Array.isArray(inputs)
  ) {
    throw new Error(
      `T2V node ${nodeId} inputs are invalid`
    );
  }

  return inputs as
    Record<string, unknown>;
}

export function bindT2VWorkflow(
  template: T2VWorkflow,
  prompt: string,
  settings: ResolvedT2VSettings
): T2VWorkflow {
  const workflow =
    structuredClone(template);

  inputsFor(
    workflow,
    "405:376",
    "PrimitiveStringMultiline"
  ).value = prompt;

  const resolution =
    inputsFor(
      workflow,
      "409",
      "ResolutionSelector"
    );

  resolution.aspect_ratio =
    aspectOption(
      settings.aspect
    ).comfyValue;

  resolution.megapixels =
    effectiveMegapixels(
      settings
    );

  resolution.multiple = 32;

  inputsFor(
    workflow,
    "405:362",
    "PrimitiveInt"
  ).value =
    settings.durationSeconds;

  inputsFor(
    workflow,
    "405:383",
    "PrimitiveBoolean"
  ).value =
    settings.enhance;

  inputsFor(
    workflow,
    "405:361",
    "PrimitiveInt"
  ).value =
    settings.fps;

  inputsFor(
    workflow,
    "405:339",
    "RandomNoise"
  ).noise_seed =
    settings.seed;

  inputsFor(
    workflow,
    "405:338",
    "RandomNoise"
  ).noise_seed =
    settings.seed2;

  inputsFor(
    workflow,
    "405:373",
    "CLIPTextEncode"
  ).text =
    settings.negativePrompt;

  inputsFor(
    workflow,
    "405:352",
    "KSamplerSelect"
  ).sampler_name =
    settings.sampler;

  inputsFor(
    workflow,
    "405:341",
    "KSamplerSelect"
  ).sampler_name =
    settings.sampler;

  for (const nodeId of [
    "405:388",
    "405:391"
  ]) {
    const guider =
      inputsFor(
        workflow,
        nodeId,
        "LTXVDualCFGGuider"
      );

    guider.video_cfg =
      settings.cfg;

    guider.audio_cfg =
      settings.cfg;
  }

  return workflow;
}
