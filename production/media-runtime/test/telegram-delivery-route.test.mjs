import test from "node:test";
import assert from "node:assert/strict";
import { parseDestination } from "../dist/delivery/worker.js";

const forum = { chatId: "-1004369617758", imageThreadId: "5", videoThreadId: "7" };
const privateChat = "5759927190";

test("delivery destinations are constrained to the configured tool topic", () => {
  assert.deepEqual(parseDestination({ provider: "telegram", chatId: forum.chatId, threadId: "5", userId: "1" }, "image.t2i", privateChat, forum), { chatId: forum.chatId, threadId: "5" });
  assert.deepEqual(parseDestination(null, "image.t2i", privateChat, forum), { chatId: privateChat, threadId: null });
  assert.throws(() => parseDestination({ provider: "telegram", chatId: forum.chatId, threadId: "7", userId: "1" }, "image.t2i", privateChat, forum));
  assert.throws(() => parseDestination({ provider: "telegram", chatId: "1", threadId: null, userId: "1" }, "video.t2v", privateChat, forum));
});
