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

  return value as Record<string, unknown>;
}

export function telegramRetryAfterSeconds(
  value: unknown
): number | null {
  const record = asRecord(value);
  const parameters = asRecord(record?.parameters);
  const raw = parameters?.retry_after;

  if (
    typeof raw === "number" &&
    Number.isSafeInteger(raw) &&
    raw > 0
  ) {
    return raw;
  }

  if (
    typeof raw === "string" &&
    /^\d+$/.test(raw)
  ) {
    const parsed = Number(raw);

    if (
      Number.isSafeInteger(parsed) &&
      parsed > 0
    ) {
      return parsed;
    }
  }

  const description =
    typeof record?.description === "string"
      ? record.description
      : typeof value === "string"
        ? value
        : value instanceof Error
          ? value.message
          : "";

  const match =
    /Too Many Requests:\s*retry after\s+(\d+)/i
      .exec(description);

  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);

  return (
    Number.isSafeInteger(parsed) &&
    parsed > 0
  )
    ? parsed
    : null;
}

export function telegramRetryDelayMs(
  value: unknown,
  paddingMs = 1000
) {
  const seconds =
    telegramRetryAfterSeconds(value);

  return seconds === null
    ? null
    : seconds * 1000 +
      Math.max(0, paddingMs);
}
