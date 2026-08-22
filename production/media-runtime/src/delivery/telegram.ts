import {
  openAsBlob
} from "node:fs";

export interface TelegramMessageResult {
  messageId: string;
}

interface MetadataInput {
  filename: string;
  runtime: string;
  video: string;
  audio: string;
  workerId: string;
  jobId: string;
  completedAt: string | null;
}

function escapeHtml(
  value: string
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function completedTimeHtml(
  value: string | null
) {
  if (!value) {
    return "Unknown";
  }

  const milliseconds =
    new Date(value).getTime();

  if (
    !Number.isFinite(
      milliseconds
    )
  ) {
    return escapeHtml(value);
  }

  const unix =
    Math.floor(
      milliseconds / 1000
    );

  return (
    `<tg-time unix="${unix}" ` +
    `format="dt">` +
    `Completed` +
    `</tg-time>`
  );
}

function parseMessageResult(
  body: unknown,
  operation: string
): TelegramMessageResult {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    throw new Error(
      `${operation} returned invalid JSON`
    );
  }

  const response =
    body as Record<
      string,
      unknown
    >;

  if (response.ok !== true) {
    const description =
      typeof response.description ===
        "string"
        ? response.description
        : "unknown Telegram error";

    throw new Error(
      `${operation} failed: ${description}`
    );
  }

  const result =
    response.result;

  if (
    result === null ||
    typeof result !== "object" ||
    Array.isArray(result)
  ) {
    throw new Error(
      `${operation} missing result`
    );
  }

  const messageId =
    (
      result as
        Record<string, unknown>
    ).message_id;

  if (
    typeof messageId !== "number" &&
    typeof messageId !== "string"
  ) {
    throw new Error(
      `${operation} missing message_id`
    );
  }

  return {
    messageId:
      String(messageId)
  };
}

export class TelegramDelivery {
  constructor(
    private readonly botToken:
      string,

    private readonly chatId:
      string
  ) {}

  private endpoint(
    method: string
  ) {
    return (
      "https://api.telegram.org/bot" +
      this.botToken +
      "/" +
      method
    );
  }

  async sendMetadata(
    input: MetadataInput
  ): Promise<TelegramMessageResult> {
    const completedTime =
      input.completedAt
        ? new Date(
            input.completedAt
          ).toLocaleString(
            "en-US",
            {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
              timeZone: process.env.HELIX_TIME_ZONE ?? "UTC"
            }
          )
        : "Unknown";

    const text = [
      "<b>[COMFY • GEN]</b>",

      `<code>${
        escapeHtml(
          input.filename
        )
      }</code>`,

      `<b>Runtime</b>: <b><i>${
        escapeHtml(
          input.runtime
        )
      }</i></b>`,

      `<b>Video</b>: <b><i>${
        escapeHtml(
          input.video
        )
      }</i></b>`,

      `<b>Audio</b>: <b><i>${
        escapeHtml(
          input.audio
        )
      }</i></b>`,

      `<b>Worker</b>: <code>${
        escapeHtml(
          input.workerId
        )
      }</code>`,

      `<b>Status</b>: <b>Completed</b> <i>(${
        escapeHtml(
          completedTime
        )
      })</i>`,

      `<i>Job</i> <code>${
        escapeHtml(
          input.jobId
        )
      }</code>`
    ].join("\n");

    const response =
      await fetch(
        this.endpoint(
          "sendMessage"
        ),
        {
          method: "POST",

          headers: {
            "content-type":
              "application/json"
          },

          body:
            JSON.stringify({
              chat_id:
                this.chatId,

              text,

              parse_mode:
                "HTML",

              link_preview_options: {
                is_disabled: true
              }
            }),

          signal:
            AbortSignal.timeout(
              30000
            )
        }
      );

    const body =
      await response.json();

    return parseMessageResult(
      body,
      "Telegram sendMessage"
    );
  }

  async sendDocument(
    input: {
      filePath: string;
      filename: string;
    }
  ): Promise<TelegramMessageResult> {
    const blob =
      await openAsBlob(
        input.filePath,
        {
          type:
            "application/octet-stream"
        }
      );

    const form =
      new FormData();

    form.set(
      "chat_id",
      this.chatId
    );

    form.set(
      "document",
      blob,
      input.filename
    );

    form.set(
      "disable_content_type_detection",
      "true"
    );

    const response =
      await fetch(
        this.endpoint(
          "sendDocument"
        ),
        {
          method: "POST",
          body: form,

          signal:
            AbortSignal.timeout(
              10 * 60 * 1000
            )
        }
      );

    const body =
      await response.json();

    return parseMessageResult(
      body,
      "Telegram sendDocument"
    );
  }
}
