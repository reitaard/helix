export interface TelegramDestination {
  chatId: string;
  threadId: string | null;
}

export interface TelegramContext extends TelegramDestination {
  botId: string;
  botUsername: string;
  updateId: number;
  userId: string;
  messageId: string;
}

export interface TelegramForumConfig {
  chatId: string;
  imageThreadId: string;
  videoThreadId: string;
}

export type TelegramRoute =
  | { kind: "private_operator" }
  | { kind: "forum_image" }
  | { kind: "forum_video" }
  | { kind: "ignored" };

export interface TelegramMessageLike {
  text?: string;
  chat?: { id: string | number; type?: string };
  from?: { id: string | number };
  message_id?: string | number;
  message_thread_id?: string | number;
  is_topic_message?: boolean;
  reply_to_message?: { message_id?: string | number };
}

export function classifyTelegramRoute(
  message: TelegramMessageLike,
  privateChatId: string,
  forum: TelegramForumConfig | null
): TelegramRoute {
  if (!message.chat) return { kind: "ignored" };
  if (String(message.chat.id) === privateChatId && message.chat.type === "private") {
    return { kind: "private_operator" };
  }
  if (!forum || message.chat.type !== "supergroup" || message.is_topic_message !== true || String(message.chat.id) !== forum.chatId) {
    return { kind: "ignored" };
  }
  if (String(message.message_thread_id) === forum.imageThreadId) return { kind: "forum_image" };
  if (String(message.message_thread_id) === forum.videoThreadId) return { kind: "forum_video" };
  return { kind: "ignored" };
}

export function commandForBot(text: string, botUsername: string): string | null {
  const token = text.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  if (!token.startsWith("/")) return null;
  const [command, suffix] = token.split("@", 2);
  if (suffix && suffix !== botUsername.toLowerCase()) return null;
  return command ?? null;
}

const T2I_CONTROL_ACTIONS = new Set([
  "reset",
  "settings",
  "setting",
  "set",
  "s"
]);

export function isDirectT2IPrompt(args: string[]): boolean {
  return args.length > 0 && !T2I_CONTROL_ACTIONS.has(args[0]!.toLowerCase());
}

export function isReplyTo(message: TelegramMessageLike, expectedMessageId: string | null): boolean {
  return expectedMessageId !== null && String(message.reply_to_message?.message_id ?? "") === expectedMessageId;
}
