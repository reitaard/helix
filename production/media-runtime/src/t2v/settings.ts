import crypto from "node:crypto";

import { z } from "zod";

export const T2V_PROFILE_ID =
  "nolan";

export const T2V_TOOL =
  "video.t2v";

export const ASPECT_OPTIONS = [
  {
    ratio: "1:1",
    label: "Square",
    comfyValue: "1:1 (Square)"
  },
  {
    ratio: "2:3",
    label: "Portrait Photo",
    comfyValue: "2:3 (Portrait Photo)"
  },
  {
    ratio: "3:2",
    label: "Photo",
    comfyValue: "3:2 (Photo)"
  },
  {
    ratio: "3:4",
    label: "Portrait Standard",
    comfyValue: "3:4 (Portrait Standard)"
  },
  {
    ratio: "4:3",
    label: "Standard",
    comfyValue: "4:3 (Standard)"
  },
  {
    ratio: "9:16",
    label: "Portrait Widescreen",
    comfyValue: "9:16 (Portrait Widescreen)"
  },
  {
    ratio: "16:9",
    label: "Widescreen",
    comfyValue: "16:9 (Widescreen)"
  },
  {
    ratio: "21:9",
    label: "Ultrawide",
    comfyValue: "21:9 (Ultrawide)"
  }
] as const;

export type T2VAspect =
  typeof ASPECT_OPTIONS[number]["ratio"];

export const QUALITY_MEGAPIXELS = {
  low: 0.5,
  standard: 0.9,
  high: 1.2
} as const;

export type T2VQuality =
  keyof typeof QUALITY_MEGAPIXELS;

export const FPS_OPTIONS = [
  12,
  24,
  30
] as const;

export const DEFAULT_NEGATIVE_PROMPT =
  "pc game, console game, video game, cartoon, childish, ugly";

const seedSchema =
  z.union([
    z.literal("random"),
    z.number()
      .int()
      .min(0)
      .max(
        Number.MAX_SAFE_INTEGER
      )
  ]);

export const t2vSettingsSchema =
  z.object({
    aspect:
      z.enum([
        "1:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "9:16",
        "16:9",
        "21:9"
      ]),

    quality:
      z.enum([
        "low",
        "standard",
        "high"
      ]),

    durationSeconds:
      z.number()
        .int()
        .min(1)
        .max(10),

    enhance:
      z.boolean(),

    fps:
      z.union([
        z.literal(12),
        z.literal(24),
        z.literal(30)
      ]),

    seed:
      seedSchema,

    seed2:
      seedSchema,

    negativePrompt:
      z.string()
        .max(2000),

    megapixelsOverride:
      z.number()
        .min(0.1)
        .max(2)
        .nullable(),

    sampler:
      z.string()
        .min(1)
        .max(100),

    cfg:
      z.number()
        .min(0)
        .max(100)
  });

export type T2VSettings =
  z.infer<
    typeof t2vSettingsSchema
  >;

export type ResolvedT2VSettings =
  Omit<
    T2VSettings,
    "seed" |
    "seed2"
  > & {
    seed: number;
    seed2: number;
  };

export const DEFAULT_T2V_SETTINGS:
  T2VSettings = {
    aspect: "16:9",
    quality: "standard",
    durationSeconds: 5,
    enhance: false,
    fps: 24,
    seed: 558811532553686,
    seed2: 42,
    negativePrompt:
      DEFAULT_NEGATIVE_PROMPT,
    megapixelsOverride: null,
    sampler:
      "euler_ancestral",
    cfg: 1
  };

function asRecord(
  value: unknown
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as
    Record<string, unknown>;
}

export function normalizeStoredT2VSettings(
  value: unknown
): T2VSettings {
  return t2vSettingsSchema.parse({
    ...DEFAULT_T2V_SETTINGS,
    ...asRecord(value)
  });
}

export function aspectOption(
  aspect: T2VAspect
) {
  const option =
    ASPECT_OPTIONS.find(
      candidate =>
        candidate.ratio ===
        aspect
    );

  if (!option) {
    throw new Error(
      `Unsupported T2V aspect: ${aspect}`
    );
  }

  return option;
}

export function effectiveMegapixels(
  settings: T2VSettings |
    ResolvedT2VSettings
) {
  return (
    settings.megapixelsOverride ??
    QUALITY_MEGAPIXELS[
      settings.quality
    ]
  );
}

export function displayQuality(
  quality: T2VQuality
) {
  return (
    quality[0]!.toUpperCase() +
    quality.slice(1)
  );
}

function randomSafeSeed() {
  const mask =
    (1n << 53n) - 1n;

  return Number(
    crypto
      .randomBytes(8)
      .readBigUInt64BE() &
    mask
  );
}

export function resolveT2VSettings(
  settings: T2VSettings
): ResolvedT2VSettings {
  return {
    ...settings,
    seed:
      settings.seed === "random"
        ? randomSafeSeed()
        : settings.seed,
    seed2:
      settings.seed2 === "random"
        ? randomSafeSeed()
        : settings.seed2
  };
}

export function hasDevOverrides(
  settings: T2VSettings
) {
  return (
    settings.fps !==
      DEFAULT_T2V_SETTINGS.fps ||
    settings.seed !==
      DEFAULT_T2V_SETTINGS.seed ||
    settings.seed2 !==
      DEFAULT_T2V_SETTINGS.seed2 ||
    settings.negativePrompt !==
      DEFAULT_T2V_SETTINGS.negativePrompt ||
    settings.megapixelsOverride !==
      DEFAULT_T2V_SETTINGS.megapixelsOverride ||
    settings.sampler !==
      DEFAULT_T2V_SETTINGS.sampler ||
    settings.cfg !==
      DEFAULT_T2V_SETTINGS.cfg
  );
}
