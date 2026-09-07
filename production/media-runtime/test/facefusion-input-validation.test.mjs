import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { FaceFusionHttpError } from "../dist/adapters/facefusion/client.js";
import { TelegramFaceFusionService } from "../dist/telegram/facefusion-service.js";

async function harness(rejectRole) {
  let state = null;
  let handle = 0;
  const sent = [];
  const spool = await mkdtemp(join(tmpdir(), "ff-semantic-input-"));
  const originalFetch = globalThis.fetch;

  const conversations = {
    async get() { return state; },
    async remove() { const old = state; state = null; return old; },
    async begin(botId, chatId, threadId, userId, settings) {
      state = { botId, chatId, threadId, userId, phase: "awaiting_source", sourceInputHandle: null, targetInputHandle: null, settings, confirmationMessageId: null };
    },
    async setSource(_botId, _chatId, _threadId, _userId, sourceInputHandle, sourceMediaKind) {
      if (!state || state.phase !== "awaiting_source") return false;
      state = { ...state, phase: "awaiting_target", sourceInputHandle, sourceMediaKind };
      return true;
    },
    async setTarget(_botId, _chatId, _threadId, _userId, targetInputHandle, targetMediaKind, settings) {
      if (!state || state.phase !== "awaiting_target") return false;
      state = { ...state, phase: "confirming", targetInputHandle, targetMediaKind, settings };
      return true;
    },
    async setConfirmation(_botId, _chatId, _threadId, _userId, messageId) { if (state) state.confirmationMessageId = messageId; },
    async setSettings() {}
  };

  const workers = {
    async uploadInput(_workerId, _path, input) {
      if (input.role === rejectRole) {
        throw new FaceFusionHttpError("/v1/inputs", 422, { code: input.role === "source" ? "no_source_face_detected" : "no_target_face_detected" });
      }
      handle += 1;
      return { handle: `handle-${handle}`, response: { faceCount: 1 } };
    },
    async deleteInput() { return true; }
  };

  const telegram = {
    async sendHtml(html, destination) { sent.push({ html, destination }); return { messageId: String(sent.length) }; },
    async sendHtmlWithInlineKeyboard(html, destination) { sent.push({ html, destination }); return { messageId: String(sent.length) }; }
  };

  globalThis.fetch = async url => {
    const text = String(url);
    if (text.endsWith("/getMe")) return Response.json({ ok: true, result: { id: 900, username: "face_bot" } });
    if (text.endsWith("/getFile")) return Response.json({ ok: true, result: { file_path: "inputs/test.bin", file_size: 4 } });
    if (text.includes("/file/bot")) return new Response(new Uint8Array([1, 2, 3, 4]));
    throw new Error(`unexpected ${url}`);
  };

  const service = new TelegramFaceFusionService(
    "runtime-test-token", "42", "facefusion-worker", { async create() { throw new Error("job must not be created"); } }, conversations,
    { async get() { return { generation: {}, normalDurationSeconds: 60, devDurationSeconds: null }; }, async save() {} },
    { async attach() {} }, { async get() { return 0; }, async save() {} }, workers, telegram, spool, 1024,
    { async list() { return []; }, async get() { return null; }, async queue() { return []; } }, null, 1800,
    async (_path, _filename, mediaKind) => ({ mediaKind, width: 512, height: 512, durationSeconds: mediaKind === "video" ? 1 : null })
  );
  await service.initialize();

  return {
    service,
    sent,
    state: () => state,
    restore: async () => { globalThis.fetch = originalFetch; await rm(spool, { recursive: true, force: true }); }
  };
}

const privateMessage = message => ({ update_id: Math.random(), message: { chat: { id: "42", type: "private" }, from: { id: "42" }, ...message } });
const text = html => html.replaceAll(/<[^>]+>/g, "").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");

test("source image with no detected face stays awaiting_source and creates no handle", async () => {
  const h = await harness("source");
  try {
    await h.service.processUpdate(privateMessage({ text: "/f" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "no-face" }] }));
    assert.equal(h.state().phase, "awaiting_source");
    assert.equal(h.state().sourceInputHandle, null);
    assert.match(text(h.sent.at(-1).html), /No face detected in the source image\.\nSend another source image\./);
  } finally { await h.restore(); }
});

test("target image with no detected face keeps accepted source and stays awaiting_target", async () => {
  const h = await harness("target");
  try {
    await h.service.processUpdate(privateMessage({ text: "/f" }));
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "source-face" }] }));
    assert.equal(h.state().phase, "awaiting_target");
    assert.equal(h.state().sourceInputHandle, "handle-1");
    await h.service.processUpdate(privateMessage({ photo: [{ file_id: "target-no-face" }] }));
    assert.equal(h.state().phase, "awaiting_target");
    assert.equal(h.state().sourceInputHandle, "handle-1");
    assert.equal(h.state().targetInputHandle, null);
    assert.match(text(h.sent.at(-1).html), /No face detected in the target image\.\nSend another target image or video\./);
  } finally { await h.restore(); }
});
