import {
  openAsBlob
} from "node:fs";

export interface TelegramMessageResult {
  messageId: string;
}

interface MetadataInput {
  filename: string;
  runtime: string;
  media: { kind: "video"; value: string; audio: string } | { kind: "image"; value: string };
  tool: string;
  workerName: string;
  jobId: string;
  completedAt: string | null;
}

function shortJobId(
  value: string
) {
  const id =
    value.startsWith("job_")
      ? value.slice(4)
      : value;

  return `${id.slice(0, 6)}...`;
}

function escapeHtml(
  value: string
) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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

  private metadataHtml(
    input: MetadataInput
  ) {
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
              timeZone:
                process.env
                  .HELIX_TIME_ZONE ??
                "UTC"
            }
          )
        : "Unknown";

    const metadata = [
      `<b>[${escapeHtml(
        input.tool
      )}]</b>`,

      `<b>Runtime</b> · <b><i>${
        escapeHtml(
          input.runtime
        )
      }</i></b>`,

      `<b>${input.media.kind === "video" ? "Video" : "Image"}</b> · <b><i>${escapeHtml(input.media.value)}</i></b>`,

      ...(input.media.kind === "video" ? [`<b>Audio</b> · <b><i>${escapeHtml(input.media.audio)}</i></b>`] : []),

      `<b>Worker</b> · <b>${
        escapeHtml(
          input.workerName
        )
      }</b>`,

      `<b>Status</b> · <b>Completed</b> · <i>${
        escapeHtml(
          completedTime
        )
      }</i>`,

      `<b>Job</b> · <code>${
        escapeHtml(
          shortJobId(
            input.jobId
          )
        )
      }</code>`
    ].join("\n");

    return [
      `<code>${
        escapeHtml(
          input.filename
        )
      }</code>`,

      `<blockquote expandable>${metadata}</blockquote>`
    ].join("\n");
  }

  async sendHtml(
    html: string
  ): Promise<TelegramMessageResult> {
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
              text: html,
              parse_mode:
                "HTML",
              link_preview_options: {
                is_disabled: true
              }
            }),
          signal:
            AbortSignal.timeout(
              30_000
            )
        }
      );

    return parseMessageResult(
      await response.json(),
      "Telegram sendMessage"
    );
  }

  async sendDocumentFile(
    input: {
      filePath: string;
      filename: string;
      caption: string;
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
      "caption",
      input.caption
    );

    form.set(
      "parse_mode",
      "HTML"
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

    return parseMessageResult(
      await response.json(),
      "Telegram sendDocument"
    );
  }

  async sendDocument(
    input: {
      filePath: string;
      filename: string;
      metadata: MetadataInput;
    }
  ): Promise<TelegramMessageResult> {
    return this.sendDocumentFile({
      filePath:
        input.filePath,
      filename:
        input.filename,
      caption:
        this.metadataHtml(
          input.metadata
        )
    });
  }
}
