import { createHash } from "node:crypto";
import { type FileHandle, open } from "node:fs/promises";

//* An uncompressed POSIX tar of regular files, the same bytes on every OS. A system tar also writes what the host keeps
//* beside a file (macOS bsdtar an AppleDouble `._` entry for extended attributes), which a receiver refusing unlisted
//* entries rejects. A name past the ustar field's 100 bytes travels in a pax `path` record before its header.
export class TarWriter {
  static readonly #block = 512;
  static readonly #nameBytes = 100;
  //? The size field holds 11 octal digits.
  static readonly #maxSize = 8 ** 11 - 1;
  readonly #handle: FileHandle;
  readonly #mtime: number;

  private constructor(handle: FileHandle, mtime: number) {
    this.#handle = handle;
    this.#mtime = mtime;
  }

  //? `mtime` (seconds) goes on every entry, so the same files make the same archive.
  static async create(file: string, { mtime = 0 }: { mtime?: number } = {}) {
    return new TarWriter(await open(file, "wx"), mtime);
  }

  async add(name: string, source: Blob): Promise<string> {
    const { size } = source;
    if (size > TarWriter.#maxSize) throw new Error(`${name} is ${size} bytes, more than a tar entry holds.`);
    if (Buffer.byteLength(name) > TarWriter.#nameBytes) {
      const pax = Buffer.from(TarWriter.#paxRecord("path", name));
      await this.#write(
        TarWriter.#header(`./PaxHeaders/${name.split("/").at(-1) ?? ""}`, pax.length, this.#mtime, "x"),
      );
      await this.#write(pax);
      await this.#pad(pax.length);
    }
    await this.#write(TarWriter.#header(name, size, this.#mtime, "0"));
    const hasher = createHash("sha256");
    let written = 0;
    for await (const chunk of source.stream()) {
      hasher.update(chunk);
      await this.#write(chunk);
      written += chunk.length;
    }
    if (written !== size) throw new Error(`${name} changed while it was archived: ${written} bytes, not ${size}.`);
    await this.#pad(size);
    return hasher.digest("hex");
  }

  async close() {
    await this.#write(new Uint8Array(TarWriter.#block * 2));
    await this.#handle.close();
  }

  async discard() {
    await this.#handle.close().catch(() => undefined);
  }

  async #write(bytes: Uint8Array) {
    for (let at = 0; at < bytes.length; ) at += (await this.#handle.write(bytes, at)).bytesWritten;
  }

  async #pad(size: number) {
    const rest = size % TarWriter.#block;
    if (rest) await this.#write(new Uint8Array(TarWriter.#block - rest));
  }

  //? A record's length counts its own digits: `<length> <key>=<value>\n`.
  static #paxRecord(key: string, value: string) {
    const body = Buffer.byteLength(` ${key}=${value}\n`);
    let length = body + 1;
    while (body + String(length).length !== length) length = body + String(length).length;
    return `${length} ${key}=${value}\n`;
  }

  static #header(name: string, size: number, mtime: number, type: "0" | "x") {
    const header = Buffer.alloc(TarWriter.#block);
    header.write(name, 0, TarWriter.#nameBytes, "utf8");
    const octal = (value: number, at: number, width: number) =>
      header.write(`${value.toString(8).padStart(width - 1, "0")}\0`, at, width, "latin1");
    octal(0o644, 100, 8);
    octal(0, 108, 8);
    octal(0, 116, 8);
    octal(size, 124, 12);
    octal(mtime, 136, 12);
    header.write("        ", 148, 8, "latin1");
    header.write(type, 156, 1, "latin1");
    header.write("ustar\0", 257, 6, "latin1");
    header.write("00", 263, 2, "latin1");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
    return header;
  }
}
