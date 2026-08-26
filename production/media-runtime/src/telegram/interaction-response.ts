export interface TelegramEditResponse {
  kind: "edit";
  messageId: string;
  html: string;
}

export type TelegramInteractionResponse =
  | string
  | TelegramEditResponse
  | null;

export function editResponse(
  messageId: string | null,
  html: string
): TelegramInteractionResponse {
  return messageId
    ? {
        kind: "edit",
        messageId,
        html
      }
    : html;
}
