import test from "node:test";
import assert from "node:assert/strict";
import { parseTelegramOffset } from "../dist/repositories/telegram-poll-offset-repository.js";

test("Telegram poll offset accepts pg BIGINT strings within safe range", () => {
  assert.equal(parseTelegramOffset("12345"), 12345);
  assert.equal(parseTelegramOffset(0), 0);
  assert.throws(() => parseTelegramOffset("9007199254740992"));
  assert.throws(() => parseTelegramOffset("-1"));
});
