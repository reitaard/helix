const DEFAULT_NEGATIVE_PROMPT =
  "pc game, console game, video game, cartoon, childish, ugly";

function escapeHtml(
  value: string
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function asRecord(
  value: unknown
): Record<string, unknown> | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as
    Record<string, unknown>;
}

function readString(
  record:
    Record<string, unknown> | null,
  key: string
) {
  const value =
    record?.[key];

  return typeof value === "string"
    ? value
    : null;
}

function readNumber(
  record:
    Record<string, unknown> | null,
  key: string
) {
  const value =
    record?.[key];

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function readBoolean(
  record:
    Record<string, unknown> | null,
  key: string
) {
  const value =
    record?.[key];

  return typeof value === "boolean"
    ? value
    : null;
}

function displayWord(
  value: string
) {
  return value.length === 0
    ? value
    : value[0]!.toUpperCase() +
      value.slice(1);
}

export function renderJobGeneration(
  request: unknown
) {
  const root =
    asRecord(request);

  const generation =
    asRecord(root?.generation);

  if (
    readString(
      generation,
      "kind"
    ) !== "t2v"
  ) {
    return null;
  }

  const settings =
    asRecord(
      generation?.settings
    );

  if (!settings) {
    return null;
  }

  const lines: string[] = [
    "<b><i>• generation •</i></b>"
  ];

  const model =
    readString(
      generation,
      "model"
    );

  if (model) {
    lines.push(
      `<b>Model</b> · <b>${escapeHtml(
        model
      )}</b>`
    );
  }

  const mode =
    readString(
      generation,
      "mode"
    );

  const modeVersion =
    readNumber(
      generation,
      "modeVersion"
    );

  if (mode) {
    lines.push(
      `<b>Mode</b> · <b>${escapeHtml(
        displayWord(mode)
      )}</b>` +
      (
        modeVersion !== null
          ? ` · <i>v${modeVersion}</i>`
          : ""
      )
    );
  }

  const aspect =
    readString(
      settings,
      "aspect"
    );

  if (aspect) {
    lines.push(
      `<b>Aspect</b> · <b>⦗${escapeHtml(
        aspect
      )}⦘</b>`
    );
  }

  const quality =
    readString(
      settings,
      "quality"
    );

  const megapixels =
    readNumber(
      settings,
      "megapixels"
    );

  if (
    quality ||
    megapixels !== null
  ) {
    const parts: string[] = [];

    if (quality) {
      parts.push(
        `<b>${escapeHtml(
          displayWord(quality)
        )}</b>`
      );
    }

    if (megapixels !== null) {
      parts.push(
        `<b>${megapixels.toFixed(1)} MP</b>`
      );
    }

    lines.push(
      `<b>Quality</b> · ${
        parts.join(" · ")
      }`
    );
  }

  const duration =
    readNumber(
      settings,
      "durationSeconds"
    );

  const frames =
    readNumber(
      settings,
      "frames"
    );

  if (
    duration !== null ||
    frames !== null
  ) {
    const parts: string[] = [];

    if (duration !== null) {
      parts.push(
        `<b>${duration}s</b>`
      );
    }

    if (frames !== null) {
      parts.push(
        `<i>${Math.round(
          frames
        )} frames</i>`
      );
    }

    lines.push(
      `<b>Duration</b> · ${
        parts.join(" · ")
      }`
    );
  }

  const enhance =
    readBoolean(
      settings,
      "enhance"
    );

  if (enhance !== null) {
    lines.push(
      `<b>Enhance</b> · <b>[${
        enhance
          ? "ON"
          : "OFF"
      }]</b>`
    );
  }

  const fps =
    readNumber(
      settings,
      "fps"
    );

  if (fps !== null) {
    lines.push(
      `<b>FPS</b> · <b>${fps}</b>`
    );
  }

  const seed =
    readNumber(
      settings,
      "seed"
    );

  if (seed !== null) {
    lines.push(
      `<b>Stage1</b> · <code>${seed}</code>`
    );
  }

  const seed2 =
    readNumber(
      settings,
      "seed2"
    );

  if (seed2 !== null) {
    lines.push(
      `<b>Stage2</b> · <code>${seed2}</code>`
    );
  }

  const negative =
    readString(
      settings,
      "negativePrompt"
    );

  if (negative !== null) {
    lines.push(
      `<b>Negative</b> · <b>${
        negative ===
          DEFAULT_NEGATIVE_PROMPT
          ? "default"
          : "custom"
      }</b>`
    );
  }

  const sampler =
    readString(
      settings,
      "sampler"
    );

  if (sampler) {
    lines.push(
      `<b>Sampler</b> · <code>${escapeHtml(
        sampler
      )}</code>`
    );
  }

  const cfg =
    readNumber(
      settings,
      "cfg"
    );

  if (cfg !== null) {
    lines.push(
      `<b>Guidance</b> · <b>${cfg.toFixed(
        1
      )}</b>`
    );
  }

  return (
    `<blockquote expandable>${
      lines.join("\n")
    }</blockquote>`
  );
}
