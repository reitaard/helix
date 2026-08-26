import assert from "node:assert/strict";
import test from "node:test";

import {
  TelegramT2IService
} from "../dist/telegram/t2i-service.js";

test("T2I prompt sends one confirmation card and captures its message id", async () => {
  const state = {
    chatId: "123",
    phase: "awaiting_prompt",
    prompt: null,
    settingsSnapshot: null,
    confirmationMessageId: null,
    invalidAttempts: 0,
    expiresAt: "2026-08-26T09:00:00.000Z",
    createdAt: "2026-08-26T08:30:00.000Z",
    updatedAt: "2026-08-26T08:30:00.000Z"
  };

  let sentHtml = null;
  let capturedMessageId = null;

  const pending = {
    async expireDue() {
      return false;
    },
    async get() {
      return state;
    },
    async setPrompt(_chatId, prompt, settingsSnapshot) {
      state.phase = "awaiting_confirmation";
      state.prompt = prompt;
      state.settingsSnapshot = settingsSnapshot;
      return true;
    },
    async captureConfirmationMessage(_chatId, messageId) {
      capturedMessageId = messageId;
      state.confirmationMessageId = messageId;
      return true;
    }
  };

  const telegram = {
    async sendHtml(html) {
      sentHtml = html;
      return {
        messageId: "9001"
      };
    }
  };

  const service =
    new TelegramT2IService(
      "123",
      "helix-rtx4060-01",
      "Annie Leibovitz",
      "/unused/workflow.json",
      {},
      pending,
      {},
      telegram,
      {
        async get() {
          return {
            aspect: "1:1",
            seed: 123
          };
        }
      },
      {},
      {
        async handlePlainText() {
          return null;
        }
      }
    );

  const response =
    await service.handlePlainText(
      "cinematic portrait in soft window light"
    );

  assert.equal(response, null);
  assert.equal(capturedMessageId, "9001");
  assert.equal(state.confirmationMessageId, "9001");
  assert.equal(state.phase, "awaiting_confirmation");
  assert.equal(state.prompt, "cinematic portrait in soft window light");
  assert.match(sentHtml, /Text2Image/);
  assert.match(sentHtml, /Generate this image/);
});
