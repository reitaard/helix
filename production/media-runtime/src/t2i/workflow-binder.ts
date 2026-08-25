import {
  dimensionsForT2IAspect
} from "./settings.js";

import type {
  ResolvedT2ISettings
} from "./settings.js";

export type T2IWorkflow =
  Record<string, Record<string, unknown>>;

interface Binding {
  nodeId: string;
  classType: string;
  input: string;
}

const BINDINGS = {
  prompt: {
    nodeId: "76",
    classType: "PrimitiveStringMultiline",
    input: "value"
  },
  width: {
    nodeId: "77:84",
    classType: "PrimitiveInt",
    input: "value"
  },
  height: {
    nodeId: "77:85",
    classType: "PrimitiveInt",
    input: "value"
  },
  seed: {
    nodeId: "77:86",
    classType: "RandomNoise",
    input: "noise_seed"
  }
} as const satisfies Record<string, Binding>;

function bindingInputs(
  workflow: T2IWorkflow,
  binding: Binding
): Record<string, unknown> {
  const node = workflow[binding.nodeId];

  if (!node || node.class_type !== binding.classType) {
    throw new Error(
      `T2I workflow binding mismatch: expected node ${binding.nodeId} ${binding.classType}.${binding.input}`
    );
  }

  const inputs = node.inputs;
  if (inputs === null || typeof inputs !== "object" || Array.isArray(inputs) || !(binding.input in inputs)) {
    throw new Error(
      `T2I workflow binding mismatch: expected node ${binding.nodeId} ${binding.classType}.${binding.input}`
    );
  }

  return inputs as Record<string, unknown>;
}

export function bindT2IWorkflow(
  template: T2IWorkflow,
  prompt: string,
  settings: ResolvedT2ISettings
): T2IWorkflow {
  const workflow = structuredClone(template);
  const dimensions = dimensionsForT2IAspect(settings.aspect);

  const promptInputs = bindingInputs(workflow, BINDINGS.prompt);
  const widthInputs = bindingInputs(workflow, BINDINGS.width);
  const heightInputs = bindingInputs(workflow, BINDINGS.height);
  const seedInputs = bindingInputs(workflow, BINDINGS.seed);

  promptInputs.value = prompt;
  widthInputs.value = dimensions.width;
  heightInputs.value = dimensions.height;
  seedInputs.noise_seed = settings.seed;

  return workflow;
}
