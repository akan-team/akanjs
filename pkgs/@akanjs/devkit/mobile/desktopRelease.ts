import { createPublicKey, verify } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isRecord, toError } from "akanjs/common";
import type { UpdateManifest } from "akanjs/native/api";
import { AkanAppConfig } from "../akanConfig";
import type { DesktopArch } from "./desktopBin";
import type { DesktopPlatform } from "./mobileTarget";
import { TarWriter } from "./tarWriter";
import { UpdateUploader } from "./updateUploader";

export type DesktopSigner = { teamId: string } | { subject: string } | null;

/** `release.json`, the one file of a desktop release archive `publish-update` did not write. */
export interface DesktopReleaseRecord {
  schema: 1;
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

//* One desktop channel's release as `publish-update` left it in `<updates>/<os>-<arch>/`: the signed manifest and the
//* files it names, packed as they are, so the same folder uploaded anywhere else stays valid.
export class DesktopRelease {
  static readonly #ed25519Spki = Buffer.from("302a300506032b6570032100", "hex");
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
    readonly manifestBytes: Uint8Array<ArrayBuffer>,
    readonly signatureBytes: Uint8Array<ArrayBuffer>,
  ) {}

  static async read(
    updatesDir: string,
    {
      platform,
      arch,
      channel,
      appId,
      publicKey,
    }: { platform: DesktopPlatform; arch: DesktopArch; channel: string; appId: string; publicKey: string },
  ) {
    const folder = `${platform}-${arch}`;
    const dir = path.join(updatesDir, folder);
    const manifestPath = path.join(dir, `${channel}.json`);
    const [manifestBytes, signatureBytes] = await Promise.all([
      readFile(manifestPath).catch(() => null),
      readFile(`${manifestPath}.sig`).catch(() => null),
    ]);
    if (!manifestBytes || !signatureBytes)
      throw new Error(
        `${manifestBytes ? `${manifestPath}.sig` : manifestPath} is missing: run \`akan publish-update\` first.`,
      );
    if (!DesktopRelease.#verifies(manifestBytes, signatureBytes, publicKey))
      throw new Error(
        `${manifestPath}.sig does not verify with updates.publicKeys[0], the one key installed apps trust: publish the release again.`,
      );
    const manifest = DesktopRelease.#parse(manifestBytes);
    if (
      manifest?.schema !== 1 ||
      manifest.kind !== "app" ||
      manifest.app !== appId ||
      manifest.platform !== platform ||
      manifest.arch !== arch ||
      manifest.channel !== channel ||
      typeof manifest.bundle !== "string" ||
      typeof manifest.sequence !== "number" ||
      typeof manifest.build !== "number" ||
      !manifest.archive
    )
      throw new Error(`${manifestPath} is not a release of ${appId} for ${folder} on channel ${channel}.`);
    const { archive, bundle, sequence, build } = manifest;
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
      manifestBytes,
      signatureBytes,
    );
  }

  record(signer: DesktopSigner): DesktopReleaseRecord {
    const { platform, arch, channel } = this;
    const builtAt = new Date(this.manifest.build * 1000).toISOString();
    return { schema: 1, cli: AkanAppConfig.akanVersion, platform, arch, channel, signer, builtAt };
  }

  //* Uncompressed, regular files only under `./` names, no directory entries; what the manifest names is checked
  //* against it while it is copied, so the archive holds the bytes the manifest signs for.
  async withArchive<T>(record: DesktopReleaseRecord, use: (archive: string) => Promise<T>): Promise<T> {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "akan-release-"));
    try {
      const archive = path.join(tmp, "release.tar");
      const tar = await TarWriter.create(archive, { mtime: this.manifest.sequence });
      try {
        await tar.add("./release.json", new Blob([`${JSON.stringify(record, null, 2)}\n`]));
        await tar.add(`./${this.channel}.json`, new Blob([this.manifestBytes]));
        await tar.add(`./${this.channel}.json.sig`, new Blob([this.signatureBytes]));
        for (const { name, size, sha256 } of this.payloads) {
          const file = Bun.file(path.join(this.dir, name));
          const what = `${path.join(this.dir, name)} is not the file ${this.channel}.json names`;
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
      return { signer: null, unread: `${this.channel}.json names no app folder` };
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

  static #verifies(manifest: Uint8Array, signature: Uint8Array, publicKey: string) {
    try {
      const key = createPublicKey({
        key: Buffer.concat([DesktopRelease.#ed25519Spki, Buffer.from(publicKey, "base64")]),
        format: "der",
        type: "spki",
      });
      return verify(null, manifest, key, Buffer.from(new TextDecoder().decode(signature).trim(), "base64"));
    } catch {
      return false;
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
