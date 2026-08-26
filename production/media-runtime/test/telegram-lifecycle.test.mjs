import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  TelegramDelivery
} from "../dist/delivery/telegram.js";
import {
  TelegramJobLifecycleRepository
} from "../dist/repositories/telegram-job-lifecycle-repository.js";

test("Telegram lifecycle migration persists confirmation and job message identity", async () => {
  const sql = await readFile(
    new URL(
      "../migrations/0014_telegram_job_lifecycle.sql",
      import.meta.url
    ),
    "utf8"
  );

  assert.match(
    sql,
    /ALTER TABLE operator_pending_t2v[\s\S]*confirmation_message_id TEXT/
  );
  assert.match(
    sql,
    /ALTER TABLE operator_pending_t2i[\s\S]*confirmation_message_id TEXT/
  );
  assert.match(
    sql,
    /CREATE TABLE IF NOT EXISTS telegram_job_lifecycles/
  );
  assert.match(
    sql,
    /job_id TEXT PRIMARY KEY[\s\S]*REFERENCES media_jobs\(id\)[\s\S]*ON DELETE CASCADE/
  );
  assert.match(
    sql,
    /UNIQUE INDEX IF NOT EXISTS[\s\S]*telegram_job_lifecycles_chat_message_idx/
  );
});

test("progress status sweep excludes delivery-owned retry and terminal-delivery cards", async () => {
  let capturedSql = "";

  const db = {
    async query(sql) {
      capturedSql = String(sql);
      return {
        rows: []
      };
    }
  };

  const repository =
    new TelegramJobLifecycleRepository(db);

  await repository.listActive();

  assert.match(
    capturedSql,
    /presentation_state = 'active'/
  );
  assert.match(
    capturedSql,
    /delivery_retrying/
  );
  assert.match(
    capturedSql,
    /delivery_failed/
  );
  assert.match(
    capturedSql,
    /NOT IN/
  );
});

test("Telegram text edits use the original message id and tolerate idempotent retry", async () => {
  const originalFetch = globalThis.fetch;
  let body = null;

  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(String(options?.body ?? "{}"));

    return new Response(
      JSON.stringify({
        ok: false,
        description: "Bad Request: message is not modified"
      }),
      {
        status: 400,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };

  try {
    const telegram =
      new TelegramDelivery(
        "test-token",
        "123"
      );

    const result =
      await telegram.editHtml(
        "456",
        "<b>[ GENERATING ]</b>"
      );

    assert.equal(result.messageId, "456");
    assert.equal(body.chat_id, "123");
    assert.equal(body.message_id, 456);
    assert.equal(body.parse_mode, "HTML");
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram media edit replaces the original text lifecycle message", async () => {
  const originalFetch = globalThis.fetch;
  const directory =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "helix-telegram-lifecycle-"
      )
    );
  const filePath =
    path.join(directory, "artifact.mp4");

  await writeFile(
    filePath,
    Buffer.from("test-artifact")
  );

  let form = null;

  globalThis.fetch = async (_url, options) => {
    form = options?.body ?? null;

    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          message_id: 456
        }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  };

  try {
    const telegram =
      new TelegramDelivery(
        "test-token",
        "123"
      );

    const result =
      await telegram.editDocumentFile({
        messageId: "456",
        filePath,
        filename: "artifact.mp4",
        caption: "<b>Completed</b>"
      });

    assert.equal(result.messageId, "456");
    assert.ok(form instanceof FormData);
    assert.equal(form.get("chat_id"), "123");
    assert.equal(form.get("message_id"), "456");

    const media =
      JSON.parse(String(form.get("media")));

    assert.equal(media.type, "document");
    assert.equal(media.media, "attach://document");
    assert.equal(media.caption, "<b>Completed</b>");
    assert.equal(media.parse_mode, "HTML");
    assert.ok(form.get("document") instanceof Blob);
  }
  finally {
    globalThis.fetch = originalFetch;
    await rm(
      directory,
      {
        recursive: true,
        force: true
      }
    );
  }
});
