import {
  openAsBlob
} from "node:fs";

import type {
  TelegramDestination
} from "../telegram/context.js";

export interface TelegramMessageResult {
  messageId: string;
}

interface MetadataInput {
  filename: string;
  runtime: string;
  media: { kind: "video"; value: string; audio: string } | { kind: "image"; value: string };
  tool: string;
  workerName: string;
  jobNumber: string;
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

function telegramMessageId(
  value: string
) {
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Invalid Telegram message_id: ${value}`
    );
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    throw new Error(
      `Invalid Telegram message_id: ${value}`
    );
  }

  return parsed;
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

function parseEditMessageResult(
  body: unknown,
  operation: string,
  requestedMessageId: string
) {
  if (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body)
  ) {
    const response =
      body as Record<string, unknown>;
    const description =
      typeof response.description === "string"
        ? response.description
        : "";

    if (
      response.ok !== true &&
      /message is not modified/i.test(
        description
      )
    ) {
      return {
        messageId: requestedMessageId
      };
    }
  }

  return parseMessageResult(
    body,
    operation
  );
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
          input.jobNumber
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
    html: string,
    destination: TelegramDestination = { chatId: this.chatId, threadId: null }
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
              chat_id: destination.chatId,
              ...(destination.threadId ? { message_thread_id: destination.threadId } : {}),
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

  async editHtml(
    messageId: string,
    html: string,
    destination: TelegramDestination = { chatId: this.chatId, threadId: null }
  ): Promise<TelegramMessageResult> {
    const response =
      await fetch(
        this.endpoint(
          "editMessageText"
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
                destination.chatId,
              message_id:
                telegramMessageId(
                  messageId
                ),
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

    return parseEditMessageResult(
      await response.json(),
      "Telegram editMessageText",
      messageId
    );
  }

  async sendDocumentFile(
    input: {
      filePath: string;
      filename: string;
      caption: string;
      destination?: TelegramDestination;
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

    const destination = input.destination ?? { chatId: this.chatId, threadId: null };

    form.set(
      "chat_id",
      destination.chatId
    );

    if (destination.threadId) {
      form.set("message_thread_id", destination.threadId);
    }

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

  async editDocumentFile(
    input: {
      messageId: string;
      filePath: string;
      filename: string;
      caption: string;
      destination?: TelegramDestination;
    }
  ): Promise<TelegramMessageResult> {
    telegramMessageId(
      input.messageId
    );

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
      input.destination?.chatId ?? this.chatId
    );

    form.set(
      "message_id",
      input.messageId
    );

    form.set(
      "media",
      JSON.stringify({
        type: "document",
        media: "attach://document",
        caption: input.caption,
        parse_mode: "HTML",
        disable_content_type_detection: true
      })
    );

    form.set(
      "document",
      blob,
      input.filename
    );

    const response =
      await fetch(
        this.endpoint(
          "editMessageMedia"
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

    return parseEditMessageResult(
      await response.json(),
      "Telegram editMessageMedia",
      input.messageId
    );
  }

  async sendDocument(
    input: {
      filePath: string;
      filename: string;
      metadata: MetadataInput;
      destination?: TelegramDestination;
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
        ),
      ...(input.destination ? { destination: input.destination } : {})
    });
  }

  async editDocument(
    input: {
      messageId: string;
      filePath: string;
      filename: string;
      metadata: MetadataInput;
      destination?: TelegramDestination;
    }
  ): Promise<TelegramMessageResult> {
    return this.editDocumentFile({
      messageId:
        input.messageId,
      filePath:
        input.filePath,
      filename:
        input.filename,
      caption:
        this.metadataHtml(
          input.metadata
        ),
      ...(input.destination ? { destination: input.destination } : {})
    });
  }
}
