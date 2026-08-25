import assert from "node:assert/strict";
import test from "node:test";

import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

import {
  join
} from "node:path";

import {
  tmpdir
} from "node:os";

import {
  createStoredZip
} from "../dist/delivery/zip.js";

test("createStoredZip writes multiple named entries and central directory", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "helix-zip-test-")
  );

  try {
    const first = join(directory, "one.txt");
    const second = join(directory, "two.txt");
    const archive = join(directory, "bundle.zip");

    await writeFile(first, "alpha", "utf8");
    await writeFile(second, "beta", "utf8");

    await createStoredZip(
      archive,
      [
        { path: first, name: "one.txt" },
        { path: second, name: "two-✓.txt" }
      ]
    );

    const data = await readFile(archive);

    assert.equal(data.readUInt32LE(0), 0x04034b50);
    assert.equal(data.readUInt16LE(6) & 0x0808, 0x0808);
    assert.ok(data.includes(Buffer.from("one.txt", "utf8")));
    assert.ok(data.includes(Buffer.from("two-✓.txt", "utf8")));
    assert.ok(data.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
    assert.equal(
      data.readUInt32LE(data.length - 22),
      0x06054b50
    );
  }
  finally {
    await rm(
      directory,
      {
        recursive: true,
        force: true
      }
    );
  }
});
