import { TelegramDelivery } from "./telegram.js";
import type { TelegramForumConfig } from "../telegram/context.js";

export interface TelegramBotDeliveryRoute {
  key: string;
  delivery: TelegramDelivery;
  privateChatId: string;
  forum: TelegramForumConfig | null;
}

export class TelegramDeliveryRouter {
  private readonly routes = new Map<string, TelegramBotDeliveryRoute>();

  constructor(routes: TelegramBotDeliveryRoute[]) {
    for (const route of routes) {
      if (this.routes.has(route.key)) throw new Error(`Duplicate Telegram bot key: ${route.key}`);
      this.routes.set(route.key, route);
    }
  }

  get(key: string) { return this.routes.get(key) ?? null; }
  has(key: string) { return this.routes.has(key); }
  keys() { return [...this.routes.keys()]; }
}
