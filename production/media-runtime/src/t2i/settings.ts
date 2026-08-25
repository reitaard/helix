import { z } from "zod";

export const T2I_PROFILE_ID = "leibovitz";
export const T2I_TOOL = "image.t2i";
export const T2I_MODEL = "FLUX.2 Klein 4B Distilled";

export const T2I_ASPECT_OPTIONS = [
  { ratio: "1:1", label: "Square" }, { ratio: "2:3", label: "Portrait Photo" },
  { ratio: "3:2", label: "Photo" }, { ratio: "4:5", label: "Portrait" },
  { ratio: "5:4", label: "Landscape" }, { ratio: "9:16", label: "Portrait Widescreen" },
  { ratio: "16:9", label: "Widescreen" }
] as const;

export const t2iSettingsSchema = z.object({
  aspect: z.enum(["1:1", "2:3", "3:2", "4:5", "5:4", "9:16", "16:9"]),
  seed: z.union([z.literal("random"), z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)])
});

export type T2ISettings = z.infer<typeof t2iSettingsSchema>;
export const DEFAULT_T2I_SETTINGS: T2ISettings = { aspect: "1:1", seed: "random" };

export function normalizeStoredT2ISettings(value: unknown): T2ISettings {
  const record = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return t2iSettingsSchema.parse({ ...DEFAULT_T2I_SETTINGS, ...record });
}
