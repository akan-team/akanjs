import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../testHelpers";
import { TarWriter } from "./tarWriter";

const makeDir = tempDirs("akan-tar-writer-");
const delta = `./app/${"a".repeat(64)}-${"b".repeat(64)}.delta.gz`;
const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const write = async (file: string, entries: [string, string][], mtime = 1_761_700_000) => {
  const tar = await TarWriter.create(file, { mtime });
  const digests: string[] = [];
  for (const [name, body] of entries) digests.push(await tar.add(name, new Blob([body])));
  await tar.close();
  return digests;
};

describe("TarWriter", () => {
  test("a system tar reads back every file under its name, a 144-byte one too, and lists nothing else", async () => {
    const dir = await makeDir();
    const file = path.join(dir, "release.tar");
    const entries: [string, string][] = [
      ["./release.json", '{"schema":1}\n'],
      [delta, "x".repeat(1_000)],
    ];

    const digests = await write(file, entries);

    expect(digests).toEqual(entries.map(([, body]) => sha256(body)));
    const listed = Bun.spawnSync(["tar", "-tf", file]).stdout.toString().split(/\r?\n/).filter(Boolean);
    expect(listed).toEqual(entries.map(([name]) => name));
    const out = path.join(dir, "out");
    await mkdir(out);
    expect(Bun.spawnSync(["tar", "-xf", file, "-C", out]).exitCode).toBe(0);
    for (const [name, body] of entries) expect(await readFile(path.join(out, name), "utf8")).toBe(body);
  });

  test("writes ustar headers of mode 0644, owner 0 and the given mtime, padded to 512-byte blocks", async () => {
    const dir = await makeDir();
    const file = path.join(dir, "release.tar");

    await write(file, [["./a.json", "{}"]], 1_761_700_000);

    const bytes = await readFile(file);
    const field = (at: number, width: number) => bytes.subarray(at, at + width).toString("latin1");
    expect(field(0, 9)).toBe("./a.json\0");
    expect(field(100, 8)).toBe("0000644\0");
    expect(field(108, 16)).toBe("0000000\x000000000\0");
    expect(Number.parseInt(field(136, 11), 8)).toBe(1_761_700_000);
    expect(field(156, 1)).toBe("0");
    expect(field(257, 8)).toBe("ustar\x0000");
    expect(bytes.length).toBe(512 + 512 + 1024);
    expect(bytes.subarray(1024).every((byte) => byte === 0)).toBe(true);
  });

  test("the same files and mtime make the same archive", async () => {
    const dir = await makeDir();
    const entries: [string, string][] = [
      ["./main.json", "{}\n"],
      [delta, "patch"],
    ];

    await write(path.join(dir, "one.tar"), entries);
    await write(path.join(dir, "two.tar"), entries);

    expect(sha256(await readFile(path.join(dir, "one.tar")))).toBe(sha256(await readFile(path.join(dir, "two.tar"))));
  });

  test("refuses a file whose length is not the one it was announced with", async () => {
    const dir = await makeDir();
    const tar = await TarWriter.create(path.join(dir, "release.tar"));
    const grown = { size: 3, stream: () => new Blob(["abcdef"]).stream() } as unknown as Blob;

    await expect(tar.add("./app/x.tar.gz", grown)).rejects.toThrow(
      "./app/x.tar.gz changed while it was archived: 6 bytes, not 3.",
    );
    await tar.discard();
  });

  test("never overwrites an existing file", async () => {
    const file = path.join(await makeDir(), "release.tar");
    await Bun.write(file, "kept");

    await expect(TarWriter.create(file)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe("kept");
  });
});
