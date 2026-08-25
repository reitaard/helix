export function escapeHtml(
  value: string
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function title(
  value: string
) {
  return (
    `<b>[ ${escapeHtml(
      value
    )} ]</b>`
  );
}

export function profileTitle(
  profile: string,
  section?: string
) {
  return (
    `<b>[</b> ` +
    `<b><i>${escapeHtml(profile)}</i></b>` +
    (section
      ? ` <b>/ ${escapeHtml(section)} ]</b>`
      : ` <b>]</b>`)
  );
}

export function shortJobId(
  value: string
) {
  const id =
    value.startsWith("job_")
      ? value.slice(4)
      : value;

  return `${id.slice(0, 6)}...`;
}

export function compactError(
  value: unknown
) {
  let message =
    "Unknown error";

  if (typeof value === "string") {
    message = value;
  }
  else if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const candidate =
      (
        value as
          Record<string, unknown>
      ).message;

    if (
      typeof candidate ===
      "string"
    ) {
      message = candidate;
    }
  }

  const compact =
    message
      .replace(/\s+/g, " ")
      .trim();

  if (compact.length <= 120) {
    return compact;
  }

  return (
    `${compact.slice(
      0,
      117
    )}...`
  );
}

export function formatDuration(
  seconds: number
) {
  const whole =
    Math.max(
      0,
      Math.floor(seconds)
    );

  const hours =
    Math.floor(
      whole / 3600
    );

  const minutes =
    Math.floor(
      (whole % 3600) / 60
    );

  const secs =
    whole % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }

  return `${secs}s`;
}

export function durationBetween(
  startedAt: string | null,
  finishedAt: string | null
) {
  if (!startedAt) {
    return "waiting";
  }

  const start =
    new Date(startedAt)
      .getTime();

  const end =
    finishedAt
      ? new Date(
          finishedAt
        ).getTime()
      : Date.now();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return "unknown";
  }

  return formatDuration(
    Math.max(
      0,
      end - start
    ) / 1000
  );
}

export function displayProvider(
  value: string
) {
  if (!value) {
    return value;
  }

  return (
    value[0]!.toUpperCase() +
    value.slice(1)
  );
}


export function formatEventTimestamp(
  value: string
) {
  const date =
    new Date(value);

  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    return value;
  }

  const timeZone =
    process.env
      .HELIX_TIME_ZONE ??
    "UTC";

  const dayFormatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone
      }
    );

  const time =
    date.toLocaleTimeString(
      "en-US",
      {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone
      }
    );

  const today =
    dayFormatter.format(
      new Date()
    );

  const eventDay =
    dayFormatter.format(
      date
    );

  if (eventDay === today) {
    return time;
  }

  const day =
    date.toLocaleDateString(
      "en-US",
      {
        month: "short",
        day: "numeric",
        timeZone
      }
    );

  return `${day} · ${time}`;
}
