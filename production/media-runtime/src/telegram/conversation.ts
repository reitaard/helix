import type { TelegramContext } from "./context.js";

export interface TelegramConversationKey {
  chatId: string;
  threadId: string;
  userId: string;
}

export function conversationKey(context: Pick<TelegramContext, "chatId" | "threadId" | "userId">): TelegramConversationKey {
  return {
    chatId: context.chatId,
    threadId: context.threadId ?? "0",
    userId: context.userId
  };
}
