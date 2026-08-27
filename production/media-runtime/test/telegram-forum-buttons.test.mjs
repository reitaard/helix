import assert from "node:assert/strict";
import test from "node:test";

import { TelegramT2IService } from "../dist/telegram/t2i-service.js";

function forumT2I() {
  const state = {
    chatId: "-1004369617758",
    threadId: "5",
    userId: "5759927190",
    phase: "awaiting_prompt",
    prompt: null,
    settingsSnapshot: null,
    confirmationMessageId: null,
    expectedReplyMessageId: null,
    invalidAttempts: 0,
    expiresAt: "2026-08-26T14:00:00.000Z",
    createdAt: "2026-08-26T13:00:00.000Z",
    updatedAt: "2026-08-26T13:00:00.000Z"
  };
  let sent = null;
  const deleted = [];

  const pending = {
    async expireDue() {},
    async get() { return state; },
    async setPrompt(_key, prompt, settings) {
      state.phase = "awaiting_confirmation";
      state.prompt = prompt;
      state.settingsSnapshot = settings;
      return true;
    },
    async captureConfirmationMessage(_key, messageId) {
      state.confirmationMessageId = messageId;
      return true;
    },
    async setExpectedReply(_key, messageId) {
      state.expectedReplyMessageId = messageId;
    }
  };
  const telegram = {
    async sendHtmlWithInlineKeyboard(html, destination, buttons) {
      sent = { html, destination, buttons };
      return { messageId: "77" };
    },
    async deleteMessage(messageId, destination) {
      deleted.push({ messageId, destination });
    }
  };
  const reset = {
    async handlePlainText() { return null; },
    async acceptsGroupReply() { return false; }
  };
  const service = new TelegramT2IService(
    "5759927190",
    "helix-rtx4060-01",
    "Annie Leibovitz",
    "/unused/workflow.json",
    {}, pending, {}, telegram,
    { async get() { return { aspect: "16:9", seed: 123 }; } },
    {}, reset
  );

  return { service, state, getSent: () => sent, deleted };
}

test("forum T2I confirmation uses buttons and removes the consumed prompt card", async () => {
  const fixture = forumT2I();
  fixture.state.expectedReplyMessageId = "75";
  await fixture.service.handlePlainText(
    "premium studio perfume bottle",
    { chatId: "-1004369617758", threadId: "5", userId: "5759927190" },
    {
      botId: "8840262367",
      botUsername: "christolanbot",
      updateId: 100,
      chatId: "-1004369617758",
      threadId: "5",
      userId: "5759927190",
      messageId: "76"
    }
  );

  const sent = fixture.getSent();
  assert.equal(sent.destination.threadId, "5");
  assert.deepEqual(sent.buttons, [[
    { text: "Generate", callback_data: "helix:t2i:generate" },
    { text: "Cancel", callback_data: "helix:t2i:cancel" }
  ]]);
  assert.match(sent.html, /Generate this image\?/);
  assert.doesNotMatch(sent.html, /Type/);
  assert.equal(fixture.state.confirmationMessageId, "77");
  assert.equal(fixture.state.expectedReplyMessageId, "77");
  assert.deepEqual(fixture.deleted, [{
    messageId: "75",
    destination: { chatId: "-1004369617758", threadId: "5" }
  }]);
});

test("forum next-message capture accepts plain text without requiring a reply", async () => {
  const fixture = forumT2I();
  fixture.state.expectedReplyMessageId = "76";
  const key = { chatId: "-1004369617758", threadId: "5", userId: "5759927190" };
  assert.equal(await fixture.service.acceptsGroupReply(key, "76"), true);
  assert.equal(await fixture.service.acceptsGroupReply(key, null), true);
  assert.equal(await fixture.service.acceptsGroupReply(key, "unexpected", false), true);

  fixture.state.phase = "awaiting_confirmation";
  fixture.state.confirmationMessageId = "77";
  fixture.state.expectedReplyMessageId = "77";
  assert.equal(
    await fixture.service.acceptsGroupReply(
      { chatId: "-1004369617758", threadId: "5", userId: "5759927190" },
      "77"
    ),
    false
  );
  assert.equal(
    await fixture.service.acceptsGroupCallback(
      { chatId: "-1004369617758", threadId: "5", userId: "5759927190" },
      "77",
      "generate"
    ),
    true
  );
  assert.equal(
    await fixture.service.acceptsGroupCallback(
      { chatId: "-1004369617758", threadId: "5", userId: "5759927190" },
      "77",
      "reset"
    ),
    false
  );
});
