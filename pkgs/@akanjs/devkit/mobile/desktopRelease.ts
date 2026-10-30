import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isRecord, toError } from "akanjs/common";
import type { UpdateManifest } from "akanjs/native/api";
import { AkanAppConfig } from "../akanConfig";
import type { DesktopArch } from "./desktopBin";
import type { DesktopPlatform } from "./mobileTarget";
import type { NativeBuildApiModule } from "./nativeApi";
import { TarWriter } from "./tarWriter";
import { UpdateUploader } from "./updateUploader";

export type DesktopSigner = { teamId: string } | { subject: string } | null;

/**
 * `release.json`, the one file of a desktop release archive `publish-update` did not write. Schema 2: the archive holds
 * the release's envelope, and its v1 pair only when that is the same release.
 */
export interface DesktopReleaseRecord {
  schema: 2;
  cli: string;
  platform: DesktopPlatform;
  arch: DesktopArch;
  channel: string;
  signer: DesktopSigner;
  builtAt: string;
}

export type SignatureTool = (
  cmd: string[],
  options?: { env?: Record<string, string> },
) => Promise<{ code: number; output: string }>;

type DesktopManifest = Partial<UpdateManifest> &
  Required<Pick<UpdateManifest, "archive" | "build" | "bundle" | "sequence">>;

interface DesktopReleasePayload {
  name: string;
  size: number;
  sha256: string;
}

interface DesktopReleaseManifestFile {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
}

//* One desktop channel's release as `publish-update` left it in `<updates>/<os>-<arch>/`: the signed envelope, the v1
//* pair of the same release, and the files the manifest names, packed as they are, so the same folder uploaded anywhere
//* else stays valid.
export class DesktopRelease {
  //? Constrained Language Mode (WDAC, AppLocker) refuses .NET type literals and method calls, so the script makes none.
  //? Windows PowerShell writes its console in the OEM code page, which mangles a subject outside it; a file keeps UTF-8.
  static readonly #authenticode = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$signature = Get-AuthenticodeSignature -LiteralPath $env:AKAN_RELEASE_EXE
$subject = if ("$($signature.Status)" -ceq 'Valid') { "$($signature.SignerCertificate.Subject)" } else { '' }
Set-Content -LiteralPath $env:AKAN_SIGNER_OUT -Value $subject -Encoding UTF8`;

  private constructor(
    readonly dir: string,
    readonly manifest: DesktopManifest,
    readonly payloads: DesktopReleasePayload[],
    readonly platform: DesktopPlatform,
    readonly arch: DesktopArch,
    readonly channel: string,
    readonly manifestFiles: DesktopReleaseManifestFile[],
  ) {}

  static async read(
    updatesDir: string,
    {
      platform,
      arch,
      channel,
      appId,
      target,
      publicKeys,
      revokedKeys = [],
      api,
    }: {
      platform: DesktopPlatform;
      arch: DesktopArch;
      channel: string;
      appId: string;
      target?: string;
      publicKeys: readonly string[];
      revokedKeys?: readonly string[];
      api: Pick<NativeBuildApiModule, "openEnvelope" | "verifyManifest">;
    },
  ) {
    const folder = `${platform}-${arch}`;
    const dir = path.join(updatesDir, folder);
    const envelopeName = `${channel}/app.json`;
    const envelopePath = path.join(dir, channel, "app.json");
    const envelope = await readFile(envelopePath).catch(() => null);
    if (!envelope) throw new Error(`${envelopePath} is missing: run \`akan publish-update\` first.`);
    const opened = DesktopRelease.#open(api, envelope, publicKeys, revokedKeys);
    if (typeof opened === "string") throw new Error(`${envelopePath}: ${opened}; publish the release again.`);
    const manifest = DesktopRelease.#parse(opened);
    if (
      manifest?.schema !== 2 ||
      manifest.kind !== "app" ||
      manifest.app !== appId ||
      manifest.platform !== platform ||
      manifest.arch !== arch ||
      manifest.channel !== channel ||
      manifest.target !== target ||
      typeof manifest.bundle !== "string" ||
      typeof manifest.sequence !== "number" ||
      typeof manifest.build !== "number" ||
      !manifest.archive
    )
      throw new Error(
        `${envelopePath} is not a release of ${appId}${target ? ` target ${target}` : ""} for ${folder} on channel ${channel}.`,
      );
    const { archive, bundle, sequence, build } = manifest;
    const legacy = await DesktopRelease.#legacyPair(api, dir, channel, publicKeys[0], manifest);
    const keys = await UpdateUploader.releaseFiles(updatesDir, { dir, channel, bundle });
    const expected = new Map(
      [{ url: archive.url, size: archive.size, sha256: archive.gzSha256 }, ...(manifest.patches ?? [])].map(
        ({ url, size, sha256 }) => [path.posix.normalize(url), { size, sha256 }],
      ),
    );
    const payloads = keys.flatMap((key) => {
      const name = key.slice(folder.length + 1);
      const digest = expected.get(name);
      return digest ? [{ name, ...digest }] : [];
    });
    return new DesktopRelease(
      dir,
      { ...manifest, archive, bundle, sequence, build },
      payloads,
      platform,
      arch,
      channel,
      [{ name: envelopeName, bytes: envelope }, ...legacy],
    );
  }

  //? An app built before protocol v2 reads the pair, signed with the first key only; a pair of an earlier release is
  //? left out, since it would publish that release again to those apps.
  static async #legacyPair(
    api: Pick<NativeBuildApiModule, "verifyManifest">,
    dir: string,
    channel: string,
    publicKey: string | undefined,
    manifest: Partial<UpdateManifest>,
  ): Promise<DesktopReleaseManifestFile[]> {
    const [bytes, signature] = await Promise.all(
      [`${channel}.json`, `${channel}.json.sig`].map((name) => readFile(path.join(dir, name)).catch(() => null)),
    );
    if (!bytes || !signature || !publicKey) return [];
    const v1 = DesktopRelease.#parse(bytes);
    if (v1?.schema !== 1 || v1.bundle !== manifest.bundle || v1.sequence !== manifest.sequence) return [];
    if (!api.verifyManifest(bytes, new TextDecoder().decode(signature).trim(), publicKey)) return [];
    return [
      { name: `${channel}.json`, bytes },
      { name: `${channel}.json.sig`, bytes: signature },
    ];
  }

  record(signer: DesktopSigner): DesktopReleaseRecord {
    const { platform, arch, channel } = this;
    const builtAt = new Date(this.manifest.build * 1000).toISOString();
    return { schema: 2, cli: AkanAppConfig.akanVersion, platform, arch, channel, signer, builtAt };
  }

  //* Akan Cloud refuses every push in any other shape: uncompressed, regular files under `./` names, no directory
  //* entry, no ustar prefix, no GNU L/K, a pax 'x' holding `path` alone, and release.json, the envelope and the v1 pair
  //* before any `app/` entry. What the manifest names is checked against it as it is copied.
  async withArchive<T>(record: DesktopReleaseRecord, use: (archive: string) => Promise<T>): Promise<T> {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "akan-release-"));
    try {
      const archive = path.join(tmp, "release.tar");
      const tar = await TarWriter.create(archive, { mtime: this.manifest.sequence });
      try {
        await tar.add("./release.json", new Blob([`${JSON.stringify(record, null, 2)}\n`]));
        for (const { name, bytes } of this.manifestFiles) await tar.add(`./${name}`, new Blob([bytes]));
        for (const { name, size, sha256 } of this.payloads) {
          const file = Bun.file(path.join(this.dir, name));
          const what = `${path.join(this.dir, name)} is not the file ${this.channel}/app.json names`;
          if (!(await file.exists()) || file.size !== size) throw new Error(`${what}: publish the release again.`);
          if ((await tar.add(`./${name}`, file)) !== sha256) throw new Error(`${what} (its sha256 differs).`);
        }
        await tar.close();
      } catch (error) {
        await tar.discard();
        throw error;
      }
      return await use(archive);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  async signer({
    exeName,
    host = process.platform,
    run = DesktopRelease.#run,
  }: {
    exeName: string;
    host?: NodeJS.Platform;
    run?: SignatureTool;
  }): Promise<{ signer: DesktopSigner; unread: string | null }> {
    if (this.platform === "linux") return { signer: null, unread: null };
    const app = this.manifest.files?.[0]?.path;
    if (!app || !/^[^/\\]+$/.test(app) || app === "." || app === "..")
      return { signer: null, unread: `${this.channel}/app.json names no app folder` };
    if (this.platform === "macos" && host !== "darwin")
      return { signer: null, unread: "codesign reads a macOS app's signer on macOS only" };
    if (this.platform === "windows" && host !== "win32")
      return { signer: null, unread: "PowerShell reads a Windows app's Authenticode signer on Windows only" };
    const tmp = await mkdtemp(path.join(os.tmpdir(), "akan-signer-"));
    try {
      const archive = path.join(this.dir, this.manifest.archive.url);
      return this.platform === "macos"
        ? await DesktopRelease.#teamOf(run, archive, tmp, app)
        : await DesktopRelease.#subjectOf(run, archive, tmp, path.posix.join(app, `${exeName}.exe`));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  //? The signature lives in the executable and _CodeSignature; Info.plist names the executable. An app signed without
  //? resources has no _CodeSignature, and bsdtar then exits 1 for the unmatched --include though it wrote the rest.
  static async #teamOf(run: SignatureTool, archive: string, tmp: string, app: string) {
    const contents = `${app}/Contents`;
    await run([
      "/usr/bin/tar",
      "-xzf",
      archive,
      "-C",
      tmp,
      ...["Info.plist", "MacOS/*", "_CodeSignature/*"].flatMap((entry) => ["--include", `${contents}/${entry}`]),
    ]);
    if (!(await Bun.file(path.join(tmp, contents, "Info.plist")).exists()))
      return { signer: null, unread: `the archive holds no ${contents}/Info.plist` };
    const { output } = await run(["/usr/bin/codesign", "--display", "--verbose=2", path.join(tmp, app)]);
    const teamId = /^TeamIdentifier=([A-Z0-9]{10})$/m.exec(output)?.[1];
    if (teamId) return { signer: { teamId }, unread: null };
    if (/^TeamIdentifier=not set$/m.test(output) || /code object is not signed at all/.test(output))
      return { signer: null, unread: null };
    return { signer: null, unread: `codesign could not read ${app}: ${output.trim().split("\n")[0] ?? ""}` };
  }

  static async #subjectOf(run: SignatureTool, archive: string, tmp: string, exe: string) {
    await run(["tar.exe", "-xzf", archive, "-C", tmp, exe]);
    const extracted = path.join(tmp, exe);
    if (!(await Bun.file(extracted).exists())) return { signer: null, unread: `the archive holds no ${exe}` };
    const out = path.join(tmp, "signer.txt");
    const { code } = await run(
      [
        path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(DesktopRelease.#authenticode, "utf16le").toString("base64"),
      ],
      { env: { AKAN_RELEASE_EXE: extracted, AKAN_SIGNER_OUT: out } },
    );
    if (code !== 0) return { signer: null, unread: `PowerShell could not read the Authenticode signature of ${exe}` };
    const subject = (await readFile(out, "utf8").catch(() => "")).replace(/^\uFEFF/, "").trim();
    return { signer: subject ? { subject } : null, unread: null };
  }

  static #open(
    api: Pick<NativeBuildApiModule, "openEnvelope">,
    envelope: Uint8Array,
    publicKeys: readonly string[],
    revokedKeys: readonly string[],
  ): Uint8Array | string {
    try {
      return api.openEnvelope(new TextDecoder().decode(envelope), publicKeys, revokedKeys).manifest;
    } catch (error) {
      return toError(error).message;
    }
  }

  static #parse(bytes: Uint8Array): Partial<UpdateManifest> | null {
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      return isRecord(value) ? (value as Partial<UpdateManifest>) : null;
    } catch {
      return null;
    }
  }

  static async #run(cmd: string[], { env }: { env?: Record<string, string> } = {}) {
    try {
      const proc = Bun.spawn(cmd, {
        env: { ...process.env, ...env },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      return { code, output: `${stdout}${stderr}` };
    } catch (error) {
      return { code: -1, output: toError(error).message };
    }
  }
}
