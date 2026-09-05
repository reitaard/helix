import {
  FACEFUSION_MODEL_DISPLAY_NAME,
  FACEFUSION_MODEL_ID,
  type FaceFusionJobRequest
} from "../adapters/facefusion/client.js";

export const FACEFUSION_DISPLAY_MODEL = FACEFUSION_MODEL_DISPLAY_NAME;
export const FACEFUSION_BACKEND_MODEL = FACEFUSION_MODEL_ID;
export const FACEFUSION_PIXEL_BOOSTS = ["256x256", "512x512"] as const;
export const FACEFUSION_SWAP_WEIGHTS = [0.35, 0.5, 0.65] as const;
export const FACEFUSION_SELECTION_MODES = ["one", "reference"] as const;

/** Telegram V1's validated subset of worker-owned FaceFusion settings. */
export interface FaceFusionSettings {
  faceSelectorMode?: typeof FACEFUSION_SELECTION_MODES[number];
  referenceFacePosition?: number;
  weight?: typeof FACEFUSION_SWAP_WEIGHTS[number];
  pixelBoost?: typeof FACEFUSION_PIXEL_BOOSTS[number];
}

/** Empty means the worker's validated native defaults are left unchanged. */
export const DEFAULT_FACEFUSION_SETTINGS: FaceFusionSettings = {};

export function normalizeFaceFusionSettings(value: unknown): FaceFusionSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const settings: FaceFusionSettings = {};
  if (FACEFUSION_SELECTION_MODES.includes(input.faceSelectorMode as never)) {
    settings.faceSelectorMode = input.faceSelectorMode as typeof FACEFUSION_SELECTION_MODES[number];
  }
  if (Number.isSafeInteger(input.referenceFacePosition) && Number(input.referenceFacePosition) >= 0) {
    settings.referenceFacePosition = Number(input.referenceFacePosition);
  }
  if (FACEFUSION_SWAP_WEIGHTS.includes(input.weight as never)) {
    settings.weight = input.weight as typeof FACEFUSION_SWAP_WEIGHTS[number];
  }
  if (FACEFUSION_PIXEL_BOOSTS.includes(input.pixelBoost as never)) {
    settings.pixelBoost = input.pixelBoost as typeof FACEFUSION_PIXEL_BOOSTS[number];
  }
  return settings;
}

function inputId(workflow: Record<string, unknown>, key: "sourceInputId" | "targetInputId") {
  const value = workflow[key];
  if (typeof value !== "string" || !/^[0-9a-f]{12}4[0-9a-f]{3}[89ab][0-9a-f]{15}$/i.test(value)) {
    throw new Error(`FaceFusion ${key} must be a 32-character UUID4 hex input id`);
  }
  return value;
}

/** Builds the exact worker 0.2.0 request. Model and execution controls are never accepted. */
export function faceFusionAdapterRequest(workflow: Record<string, unknown>, jobId: string): FaceFusionJobRequest {
  if (!jobId) throw new Error("FaceFusion submission requires the durable Helix job id");
  return {
    jobId,
    sourceInputId: inputId(workflow, "sourceInputId"),
    targetInputId: inputId(workflow, "targetInputId"),
    settings: { ...normalizeFaceFusionSettings(workflow.settings) }
  };
}
