import type { T2ISettings } from "./settings.js";

/**
 * Reserved integration seam for the locally validated FLUX T2I API workflow.
 * No Comfy node IDs, dimensions, or model-specific mutation is defined until
 * that workflow and its RTX 4060 benchmark are supplied.
 */
export interface T2IWorkflow extends Record<string, Record<string, unknown>> {}

export function bindT2IWorkflow(_workflow: T2IWorkflow, _prompt: string, _settings: T2ISettings): never {
  throw new Error("T2I workflow binding is unavailable until the vetted FLUX API workflow is supplied");
}
