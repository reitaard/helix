import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyTelegramRoute,
  commandForBot,
  isDirectT2IPrompt
} from "../dist/telegram/context.js";

const forum = {
  chatId: "-1004369617758",
  imageThreadId: "5",
  videoThreadId: "7"
};

function message(overrides = {}) {
  return {
    chat: { id: -1004369617758, type: "supergroup" },
    from: { id: 11 },
    message_id: 99,
    is_topic_message: true,
    message_thread_id: 5,
    ...overrides
  };
}

test("Telegram routing accepts only configured private and forum topics", () => {
  assert.deepEqual(classifyTelegramRoute(
    { chat: { id: "5759927190", type: "private" } }, "5759927190", forum
  ), { kind: "private_operator" });
  assert.deepEqual(classifyTelegramRoute(message(), "5759927190", forum), { kind: "forum_image" });
  assert.deepEqual(classifyTelegramRoute(message({ message_thread_id: 7 }), "5759927190", forum), { kind: "forum_video" });
  assert.deepEqual(classifyTelegramRoute(message({ message_thread_id: 1 }), "5759927190", forum), { kind: "ignored" });
  assert.deepEqual(classifyTelegramRoute(message({ is_topic_message: false }), "5759927190", forum), { kind: "ignored" });
  assert.deepEqual(classifyTelegramRoute(message({ chat: { id: -1004369617758, type: "group" } }), "5759927190", forum), { kind: "ignored" });
  assert.deepEqual(classifyTelegramRoute({ chat: { id: "5759927190", type: "supergroup" } }, "5759927190", forum), { kind: "ignored" });
});

test("Telegram command suffixes only accept this bot", () => {
  assert.equal(commandForBot("/t2i@christolanbot prompt", "christolanbot"), "/t2i");
  assert.equal(commandForBot("/t2i@otherbot prompt", "christolanbot"), null);
  assert.equal(commandForBot("prompt", "christolanbot"), null);
});

test("forum T2I distinguishes direct prompts from control commands", () => {
  assert.equal(isDirectT2IPrompt([]), false);
  assert.equal(isDirectT2IPrompt(["settings"]), false);
  assert.equal(isDirectT2IPrompt(["set", "aspect", "16:9"]), false);
  assert.equal(isDirectT2IPrompt(["reset"]), false);
  assert.equal(isDirectT2IPrompt(["A", "widescreen", "landscape"]), true);
});
