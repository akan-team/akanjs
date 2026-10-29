import { describe, expect, test } from "bun:test";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AkanAppConfig } from "../akanConfig";
import { tempDirs } from "../testHelpers";
import type { DesktopArch } from "./desktopBin";
import { DesktopRelease, type SignatureTool } from "./desktopRelease";
import type { DesktopPlatform } from "./mobileTarget";

const makeDir = tempDirs("akan-desktop-release-");
const sha256 = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const keyOf = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64"),
    sign: (bytes: string) => `${sign(null, Buffer.from(bytes), privateKey).toString("base64")}\n`,
  };
};
const key = keyOf();
const appId = "com.akancad.app";

interface Published {
  updatesDir: string;
  dir: string;
  tarSha: string;
  delta: string;
  build: number;
}

const publish = async ({
  platform = "macos",
  arch = "arm64",
  channel = "main",
  app = platform === "macos" ? "Akancad.app" : "akancad",
  gz = "the release's gzip tar",
}: {
  platform?: DesktopPlatform;
  arch?: DesktopArch;
  channel?: string;
  app?: string;
  gz?: string;
} = {}) => {
  const updatesDir = await makeDir();
  const dir = path.join(updatesDir, `${platform}-${arch}`);
  await mkdir(path.join(dir, "app"), { recursive: true });
  const tarSha = sha256(`${channel} tar`);
  const from = sha256("the previous tar");
  const delta = `${from}-${tarSha}.delta.gz`;
  await writeFile(path.join(dir, "app", `${tarSha}.tar.gz`), gz);
  await writeFile(path.join(dir, "app", delta), "a delta");
  const build = 1_761_699_000;
  const manifest = {
    schema: 1,
    kind: "app",
    app: appId,
    platform,
    channel,
    sequence: 1_761_700_000,
    bundle: "1.2.0-1761700000",
    runtimeVersion: "0.12.0",
    version: "1.2.0",
    build,
    arch,
    files: [{ path: app, sha256: tarSha, size: 2048 }],
    archive: { sha256: tarSha, url: `app/${tarSha}.tar.gz`, size: gz.length, gzSha256: sha256(gz) },
    patches: [{ from, url: `app/${delta}`, sha256: sha256("a delta"), size: 7 }],
    server: true,
  };
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(dir, `${channel}.json`), bytes);
  await writeFile(path.join(dir, `${channel}.json.sig`), key.sign(bytes));
  return { updatesDir, dir, tarSha, delta, build } satisfies Published;
};

const read = (
  { updatesDir }: Published,
  {
    platform = "macos",
    arch = "arm64",
    channel = "main",
    publicKey = key.publicKey,
    id = appId,
  }: { platform?: DesktopPlatform; arch?: DesktopArch; channel?: string; publicKey?: string; id?: string } = {},
) => DesktopRelease.read(updatesDir, { platform, arch, channel, appId: id, publicKey });

const entriesOf = (archive: string) =>
  Bun.spawnSync(["tar", "-tf", archive]).stdout.toString().split(/\r?\n/).filter(Boolean);

//? Every header, a pax one too: a file's name is the `path` of the pax header before it, else its own name field.
const headersOf = (bytes: Uint8Array) => {
  const headers: { type: string; name: string; prefix: string; paxKeys: string[] }[] = [];
  let paxPath: string | null = null;
  for (let at = 0; at + 512 <= bytes.length; ) {
    const block = Buffer.from(bytes.subarray(at, at + 512));
    if (block.every((byte) => byte === 0)) break;
    const field = (from: number, width: number) => block.toString("latin1", from, from + width).replace(/\0.*$/s, "");
    const type = field(156, 1);
    const size = Number.parseInt(field(124, 12), 8);
    const records = Buffer.from(bytes.subarray(at + 512, at + 512 + size))
      .toString("utf8")
      .split("\n")
      .filter(Boolean);
    at += 512 + Math.ceil(size / 512) * 512;
    const pax = type === "x" ? records.map((record) => record.slice(record.indexOf(" ") + 1)) : [];
    const paxKeys = pax.map((record) => record.slice(0, record.indexOf("=")));
    headers.push({ type, name: (type === "x" ? null : paxPath) ?? field(0, 100), prefix: field(345, 155), paxKeys });
    paxPath = type === "x" ? (pax.find((record) => record.startsWith("path="))?.slice(5) ?? null) : null;
  }
  return headers;
};

const extract = async (archive: string) => {
  const out = await makeDir();
  expect(Bun.spawnSync(["tar", "-xf", archive, "-C", out]).exitCode).toBe(0);
  return out;
};

describe("DesktopRelease", () => {
  test("packs only what the channel's manifest names: no other channel, earlier archive or folder record", async () => {
    const published = await publish();
    const { dir, tarSha, delta } = published;
    await publish({ channel: "develop" }).then(async (other) => {
      for (const name of ["develop.json", "develop.json.sig"])
        await writeFile(path.join(dir, name), await readFile(path.join(other.dir, name)));
    });
    await writeFile(path.join(dir, "app", `${sha256("an earlier tar")}.tar.gz`), "an earlier release");
    await writeFile(path.join(dir, "mirror.txt"), "not part of the release");
    const release = await read(published);

    const entries = await release.withArchive(release.record(null), async (archive) => entriesOf(archive));

    expect(entries).toEqual([
      "./release.json",
      "./main.json",
      "./main.json.sig",
      `./app/${tarSha}.tar.gz`,
      `./app/${delta}`,
    ]);
  });

  test("keeps the one tar shape Akan Cloud accepts, a pax name of a long patch included", async () => {
    const published = await publish();
    const release = await read(published);

    const headers = await release.withArchive(release.record(null), async (archive) =>
      headersOf(await readFile(archive)),
    );

    expect(new Set(headers.map(({ type }) => type))).toEqual(new Set(["0", "x"]));
    expect(headers.filter(({ prefix }) => prefix)).toEqual([]);
    expect(headers.filter(({ type }) => type === "x").map(({ paxKeys }) => paxKeys)).toEqual([["path"]]);
    const files = headers.filter(({ type }) => type === "0").map(({ name }) => name);
    expect(files.slice(0, 3)).toEqual(["./release.json", "./main.json", "./main.json.sig"]);
    expect(files.slice(3).every((name) => name.startsWith("./app/"))).toBe(true);
    expect(files.slice(3)).toEqual([`./app/${published.tarSha}.tar.gz`, `./app/${published.delta}`]);
    expect(Buffer.byteLength(`./app/${published.delta}`)).toBeGreaterThan(100);
  });

  test("the manifest and its signature go in byte for byte, beside a release.json of the CLI and the build time", async () => {
    const published = await publish();
    const release = await read(published);
    const record = release.record({ teamId: "ABCDE12345" });

    const out = await release.withArchive(record, extract);

    for (const name of ["main.json", "main.json.sig"])
      expect(sha256(await readFile(path.join(out, name)))).toBe(sha256(await readFile(path.join(published.dir, name))));
    expect(await readFile(path.join(out, "release.json"), "utf8")).toBe(`${JSON.stringify(record, null, 2)}\n`);
    expect(record).toEqual({
      schema: 1,
      cli: AkanAppConfig.akanVersion,
      platform: "macos",
      arch: "arm64",
      channel: "main",
      signer: { teamId: "ABCDE12345" },
      builtAt: new Date(published.build * 1000).toISOString(),
    });
  });

  test("leaves no archive behind, also when the upload fails", async () => {
    const release = await read(await publish());
    let kept = "";

    await expect(
      release.withArchive(release.record(null), async (archive) => {
        kept = archive;
        throw new Error("upload failed");
      }),
    ).rejects.toThrow("upload failed");
    expect(await Bun.file(kept).exists()).toBe(false);
  });

  test("refuses a manifest the target's first key did not sign, before reading anything it names", async () => {
    const published = await publish();

    await expect(read(published, { publicKey: keyOf().publicKey })).rejects.toThrow(
      "main.json.sig does not verify with updates.publicKeys[0], the one key installed apps trust",
    );
  });

  test("refuses a release of another app, and names a channel or CPU it holds none of", async () => {
    const published = await publish();

    await expect(read(published, { id: "com.other" })).rejects.toThrow(
      "is not a release of com.other for macos-arm64 on channel main.",
    );
    await expect(read(published, { channel: "develop" })).rejects.toThrow(
      `${path.join(published.dir, "develop.json")} is missing: run \`akan publish-update\` first.`,
    );
    await expect(read(published, { arch: "x64" })).rejects.toThrow("macos-x64");
  });

  test("refuses an archive that is not the file the manifest names, by its length or its digest", async () => {
    const published = await publish();
    const archive = path.join(published.dir, "app", `${published.tarSha}.tar.gz`);
    const release = await read(published);
    const send = () => release.withArchive(release.record(null), async () => "sent");

    await writeFile(archive, "the release's gzip tar!");
    await expect(send()).rejects.toThrow(`${archive} is not the file main.json names: publish the release again.`);
    await writeFile(archive, "the release's gzip taR");
    await expect(send()).rejects.toThrow(`${archive} is not the file main.json names (its sha256 differs).`);
  });
});

const recordingTool = (
  answer: (cmd: string[], env: Record<string, string>) => Promise<{ code: number; output: string }>,
) => {
  const calls: { cmd: string[]; env: Record<string, string> }[] = [];
  const run: SignatureTool = async (cmd, { env = {} } = {}) => {
    calls.push({ cmd, env });
    return await answer(cmd, env);
  };
  return { calls, run };
};
const bom = String.fromCharCode(0xfeff);
const extractedTo = (cmd: string[]) => cmd[cmd.indexOf("-C") + 1] ?? "";

describe("DesktopRelease signer", () => {
  const macTool = (codesign: { code: number; output: string }, { plist = true } = {}) =>
    recordingTool(async (cmd) => {
      if (cmd[0] === "/usr/bin/tar") {
        if (plist) await Bun.write(path.join(extractedTo(cmd), "Akancad.app/Contents/Info.plist"), "<plist/>");
        return { code: 1, output: "tar: _CodeSignature/*: Not found in archive" };
      }
      return codesign;
    });

  test("macOS: the TeamIdentifier codesign shows for the app in the archive", async () => {
    const release = await read(await publish());
    const { calls, run } = macTool({
      code: 0,
      output: "Executable=…\nTeamIdentifier=ABCDE12345\nSealed Resources=none\n",
    });

    expect(await release.signer({ exeName: "akancad", host: "darwin", run })).toEqual({
      signer: { teamId: "ABCDE12345" },
      unread: null,
    });
    const [extraction, display] = calls;
    expect(extraction?.cmd.slice(0, 3)).toEqual([
      "/usr/bin/tar",
      "-xzf",
      path.join(release.dir, release.manifest.archive.url),
    ]);
    expect(extraction?.cmd.filter((_, idx, cmd) => cmd[idx - 1] === "--include")).toEqual([
      "Akancad.app/Contents/Info.plist",
      "Akancad.app/Contents/MacOS/*",
      "Akancad.app/Contents/_CodeSignature/*",
    ]);
    expect(display?.cmd).toEqual([
      "/usr/bin/codesign",
      "--display",
      "--verbose=2",
      path.join(extractedTo(extraction?.cmd ?? []), "Akancad.app"),
    ]);
  });

  test("macOS: an app signed ad hoc or not at all has no signer, and nothing to warn about", async () => {
    const release = await read(await publish());
    const adHoc = macTool({ code: 0, output: "Signature=adhoc\nTeamIdentifier=not set\n" });
    const unsigned = macTool({ code: 1, output: "/tmp/x/Akancad.app: code object is not signed at all\n" });

    for (const { run } of [adHoc, unsigned])
      expect(await release.signer({ exeName: "akancad", host: "darwin", run })).toEqual({ signer: null, unread: null });
  });

  test("macOS: says why when codesign or the archive cannot tell", async () => {
    const release = await read(await publish());

    expect(
      await release.signer({ exeName: "akancad", host: "darwin", run: macTool({ code: 1, output: "boom\n" }).run }),
    ).toEqual({ signer: null, unread: "codesign could not read Akancad.app: boom" });
    expect(
      await release.signer({
        exeName: "akancad",
        host: "darwin",
        run: macTool({ code: 0, output: "" }, { plist: false }).run,
      }),
    ).toEqual({ signer: null, unread: "the archive holds no Akancad.app/Contents/Info.plist" });
    const { calls, run } = macTool({ code: 0, output: "TeamIdentifier=ABCDE12345\n" });
    expect(await release.signer({ exeName: "akancad", host: "linux", run })).toEqual({
      signer: null,
      unread: "codesign reads a macOS app's signer on macOS only",
    });
    expect(calls).toEqual([]);
  });

  const windowsTool = (powershell: (out: string) => Promise<number>) =>
    recordingTool(async (cmd, env) => {
      if (cmd[0] === "tar.exe") {
        await Bun.write(path.join(extractedTo(cmd), cmd.at(-1) ?? ""), "MZ");
        return { code: 0, output: "" };
      }
      return { code: await powershell(env.AKAN_SIGNER_OUT), output: "" };
    });

  test("Windows: the Authenticode subject of the app's executable, read as UTF-8", async () => {
    const release = await read(await publish({ platform: "windows", arch: "x64" }), {
      platform: "windows",
      arch: "x64",
    });
    const subject = "CN=아칸 주식회사, O=아칸 주식회사, C=KR";
    const { calls, run } = windowsTool(async (out) => {
      await Bun.write(out, `${bom}${subject}\r\n`);
      return 0;
    });

    expect(await release.signer({ exeName: "akancad", host: "win32", run })).toEqual({
      signer: { subject },
      unread: null,
    });
    const [extraction, check] = calls;
    expect(extraction?.cmd.at(-1)).toBe("akancad/akancad.exe");
    expect(check?.env.AKAN_RELEASE_EXE).toBe(path.join(extractedTo(extraction?.cmd ?? []), "akancad/akancad.exe"));
    expect(check?.cmd.slice(1, 4)).toEqual(["-NoProfile", "-NonInteractive", "-EncodedCommand"]);
    expect(Buffer.from(check?.cmd[4] ?? "", "base64").toString("utf16le")).toContain(
      "Get-AuthenticodeSignature -LiteralPath $env:AKAN_RELEASE_EXE",
    );
  });

  test("Windows: an executable without a valid signature has no signer; a PowerShell that fails says so", async () => {
    const release = await read(await publish({ platform: "windows", arch: "x64" }), {
      platform: "windows",
      arch: "x64",
    });
    const unsigned = windowsTool(async (out) => {
      await Bun.write(out, `${bom}\r\n`);
      return 0;
    });
    const blocked = windowsTool(async () => 1);

    expect(await release.signer({ exeName: "akancad", host: "win32", run: unsigned.run })).toEqual({
      signer: null,
      unread: null,
    });
    expect(await release.signer({ exeName: "akancad", host: "win32", run: blocked.run })).toEqual({
      signer: null,
      unread: "PowerShell could not read the Authenticode signature of akancad/akancad.exe",
    });
    expect(await release.signer({ exeName: "akancad", host: "darwin", run: unsigned.run })).toEqual({
      signer: null,
      unread: "PowerShell reads a Windows app's Authenticode signer on Windows only",
    });
  });

  test("Linux: no signer, and nothing run", async () => {
    const release = await read(await publish({ platform: "linux", arch: "x64" }), { platform: "linux", arch: "x64" });
    const { calls, run } = recordingTool(async () => ({ code: 0, output: "" }));

    expect(await release.signer({ exeName: "akancad", host: "linux", run })).toEqual({ signer: null, unread: null });
    expect(calls).toEqual([]);
  });

  test.skipIf(process.platform !== "darwin")(
    "macOS: reads an ad hoc signature from the archive itself with the system tar and codesign",
    async () => {
      const build = await makeDir();
      const contents = path.join(build, "Akancad.app", "Contents");
      await mkdir(path.join(contents, "MacOS"), { recursive: true });
      await mkdir(path.join(contents, "Resources"), { recursive: true });
      await writeFile(path.join(contents, "Resources", "server.json"), "{}");
      await writeFile(
        path.join(contents, "Info.plist"),
        '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>akancad</string><key>CFBundleIdentifier</key><string>com.akancad.app</string></dict></plist>\n',
      );
      await writeFile(path.join(contents, "MacOS", "akancad"), await readFile("/usr/bin/true"));
      const signed = Bun.spawnSync(["/usr/bin/codesign", "--force", "--sign", "-", path.join(build, "Akancad.app")]);
      expect(signed.exitCode).toBe(0);
      const gz = path.join(build, "release.tar.gz");
      const tarred = Bun.spawnSync(["/usr/bin/tar", "--no-mac-metadata", "-czf", gz, "-C", build, "Akancad.app"]);
      expect(tarred.exitCode).toBe(0);
      const published = await publish();
      await writeFile(path.join(published.dir, "app", `${published.tarSha}.tar.gz`), await readFile(gz));
      const release = await read(published);

      expect(await release.signer({ exeName: "akancad" })).toEqual({ signer: null, unread: null });
    },
  );
});
