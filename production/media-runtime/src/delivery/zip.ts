import {
  createReadStream,
  createWriteStream
} from "node:fs";

import {
  stat
} from "node:fs/promises";

import {
  once
} from "node:events";

export interface ZipInputFile {
  path: string;
  name: string;
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
  let value = crc >>> 0;

  for (const byte of chunk) {
    value =
      CRC_TABLE[(value ^ byte) & 0xff]! ^
      (value >>> 8);
  }

  return value >>> 0;
}

function dosDateTime(
  date: Date
) {
  const year = Math.max(1980, date.getFullYear());
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return {
    time: time & 0xffff,
    date: day & 0xffff
  };
}

async function writeChunk(
  stream: ReturnType<typeof createWriteStream>,
  chunk: Buffer
) {
  if (!stream.write(chunk)) {
    await once(stream, "drain");
  }
}

function localHeader(
  name: Buffer,
  date: Date
) {
  const stamp = dosDateTime(date);
  const buffer = Buffer.alloc(30 + name.length);

  buffer.writeUInt32LE(0x04034b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(0x0008, 6);
  buffer.writeUInt16LE(0, 8);
  buffer.writeUInt16LE(stamp.time, 10);
  buffer.writeUInt16LE(stamp.date, 12);
  buffer.writeUInt32LE(0, 14);
  buffer.writeUInt32LE(0, 18);
  buffer.writeUInt32LE(0, 22);
  buffer.writeUInt16LE(name.length, 26);
  buffer.writeUInt16LE(0, 28);
  name.copy(buffer, 30);

  return buffer;
}

function dataDescriptor(
  crc: number,
  size: number
) {
  const buffer = Buffer.alloc(16);

  buffer.writeUInt32LE(0x08074b50, 0);
  buffer.writeUInt32LE(crc >>> 0, 4);
  buffer.writeUInt32LE(size >>> 0, 8);
  buffer.writeUInt32LE(size >>> 0, 12);

  return buffer;
}

function centralHeader(
  input: {
    name: Buffer;
    date: Date;
    crc: number;
    size: number;
    offset: number;
  }
) {
  const stamp = dosDateTime(input.date);
  const buffer = Buffer.alloc(46 + input.name.length);

  buffer.writeUInt32LE(0x02014b50, 0);
  buffer.writeUInt16LE(20, 4);
  buffer.writeUInt16LE(20, 6);
  buffer.writeUInt16LE(0x0008, 8);
  buffer.writeUInt16LE(0, 10);
  buffer.writeUInt16LE(stamp.time, 12);
  buffer.writeUInt16LE(stamp.date, 14);
  buffer.writeUInt32LE(input.crc >>> 0, 16);
  buffer.writeUInt32LE(input.size >>> 0, 20);
  buffer.writeUInt32LE(input.size >>> 0, 24);
  buffer.writeUInt16LE(input.name.length, 28);
  buffer.writeUInt16LE(0, 30);
  buffer.writeUInt16LE(0, 32);
  buffer.writeUInt16LE(0, 34);
  buffer.writeUInt16LE(0, 36);
  buffer.writeUInt32LE(0, 38);
  buffer.writeUInt32LE(input.offset >>> 0, 42);
  input.name.copy(buffer, 46);

  return buffer;
}

function endOfCentralDirectory(
  entries: number,
  centralSize: number,
  centralOffset: number
) {
  const buffer = Buffer.alloc(22);

  buffer.writeUInt32LE(0x06054b50, 0);
  buffer.writeUInt16LE(0, 4);
  buffer.writeUInt16LE(0, 6);
  buffer.writeUInt16LE(entries, 8);
  buffer.writeUInt16LE(entries, 10);
  buffer.writeUInt32LE(centralSize >>> 0, 12);
  buffer.writeUInt32LE(centralOffset >>> 0, 16);
  buffer.writeUInt16LE(0, 20);

  return buffer;
}

export async function createStoredZip(
  outputPath: string,
  files: ZipInputFile[]
) {
  if (files.length === 0) {
    throw new Error("ZIP requires at least one file");
  }

  if (files.length > 0xffff) {
    throw new Error("ZIP contains too many files");
  }

  const stream = createWriteStream(
    outputPath,
    { mode: 0o600 }
  );

  let offset = 0;
  const central: Buffer[] = [];

  try {
    for (const file of files) {
      const info = await stat(file.path);
      const size = Number(info.size);

      if (!Number.isSafeInteger(size) || size > 0xffffffff) {
        throw new Error(
          `ZIP file is too large: ${file.name}`
        );
      }

      const name = Buffer.from(file.name, "utf8");
      const entryOffset = offset;
      const header = localHeader(name, info.mtime);

      await writeChunk(stream, header);
      offset += header.length;

      let crc = 0xffffffff;
      let written = 0;

      for await (const value of createReadStream(file.path)) {
        const chunk = Buffer.isBuffer(value)
          ? value
          : Buffer.from(value);

        crc = updateCrc(crc, chunk);
        written += chunk.length;
        await writeChunk(stream, chunk);
        offset += chunk.length;
      }

      if (written !== size) {
        throw new Error(
          `ZIP source changed while reading: ${file.name}`
        );
      }

      const finalCrc = (crc ^ 0xffffffff) >>> 0;
      const descriptor = dataDescriptor(finalCrc, size);

      await writeChunk(stream, descriptor);
      offset += descriptor.length;

      central.push(
        centralHeader({
          name,
          date: info.mtime,
          crc: finalCrc,
          size,
          offset: entryOffset
        })
      );
    }

    const centralOffset = offset;

    for (const header of central) {
      await writeChunk(stream, header);
      offset += header.length;
    }

    const centralSize = offset - centralOffset;

    if (
      centralOffset > 0xffffffff ||
      centralSize > 0xffffffff
    ) {
      throw new Error("ZIP archive exceeds classic ZIP limits");
    }

    const end = endOfCentralDirectory(
      central.length,
      centralSize,
      centralOffset
    );

    await writeChunk(stream, end);
    stream.end();
    await once(stream, "close");
  }
  catch (error) {
    stream.destroy();
    throw error;
  }
}
