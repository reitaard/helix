import {
  createReadStream,
  createWriteStream
} from "node:fs";

import {
  once
} from "node:events";

import {
  basename
} from "node:path";

interface ZipEntry {
  path: string;
  name?: string;
}

interface CentralEntry {
  name: Buffer;
  crc32: number;
  size: number;
  offset: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function updateCrc(
  crc: number,
  chunk: Buffer
) {
  let value = crc;

  for (const byte of chunk) {
    value =
      CRC_TABLE[(value ^ byte) & 0xff]! ^
      (value >>> 8);
  }

  return value >>> 0;
}

function localHeader(name: Buffer) {
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0008, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(0, 18);
  header.writeUInt32LE(0, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  name.copy(header, 30);
  return header;
}

function descriptor(
  crc32: number,
  size: number
) {
  const value = Buffer.alloc(16);
  value.writeUInt32LE(0x08074b50, 0);
  value.writeUInt32LE(crc32 >>> 0, 4);
  value.writeUInt32LE(size >>> 0, 8);
  value.writeUInt32LE(size >>> 0, 12);
  return value;
}

function centralHeader(entry: CentralEntry) {
  const header = Buffer.alloc(46 + entry.name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0008, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt16LE(0, 14);
  header.writeUInt32LE(entry.crc32 >>> 0, 16);
  header.writeUInt32LE(entry.size >>> 0, 20);
  header.writeUInt32LE(entry.size >>> 0, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.offset >>> 0, 42);
  entry.name.copy(header, 46);
  return header;
}

function endRecord(
  count: number,
  centralSize: number,
  centralOffset: number
) {
  const value = Buffer.alloc(22);
  value.writeUInt32LE(0x06054b50, 0);
  value.writeUInt16LE(0, 4);
  value.writeUInt16LE(0, 6);
  value.writeUInt16LE(count, 8);
  value.writeUInt16LE(count, 10);
  value.writeUInt32LE(centralSize >>> 0, 12);
  value.writeUInt32LE(centralOffset >>> 0, 16);
  value.writeUInt16LE(0, 20);
  return value;
}

async function write(
  stream: ReturnType<typeof createWriteStream>,
  data: Buffer
) {
  if (!stream.write(data)) {
    await once(stream, "drain");
  }
}

export async function createStoredZip(
  destination: string,
  entries: ZipEntry[]
) {
  const output = createWriteStream(destination, {
    mode: 0o600
  });

  const central: CentralEntry[] = [];
  let offset = 0;

  try {
    for (const entry of entries) {
      const name = Buffer.from(
        entry.name ?? basename(entry.path),
        "utf8"
      );

      const header = localHeader(name);
      const localOffset = offset;
      await write(output, header);
      offset += header.length;

      let crc = 0xffffffff;
      let size = 0;

      for await (const raw of createReadStream(entry.path)) {
        const chunk = Buffer.isBuffer(raw)
          ? raw
          : Buffer.from(raw);

        crc = updateCrc(crc, chunk);
        size += chunk.length;

        if (size > 0xffffffff) {
          throw new Error("ZIP bundle entry exceeds 4 GiB");
        }

        await write(output, chunk);
        offset += chunk.length;
      }

      const finalCrc = (crc ^ 0xffffffff) >>> 0;
      const tail = descriptor(finalCrc, size);
      await write(output, tail);
      offset += tail.length;

      central.push({
        name,
        crc32: finalCrc,
        size,
        offset: localOffset
      });
    }

    const centralOffset = offset;

    for (const entry of central) {
      const header = centralHeader(entry);
      await write(output, header);
      offset += header.length;
    }

    const centralSize = offset - centralOffset;
    const end = endRecord(
      central.length,
      centralSize,
      centralOffset
    );

    await write(output, end);
    output.end();
    await once(output, "close");
  }
  catch (error) {
    output.destroy();
    throw error;
  }
}
