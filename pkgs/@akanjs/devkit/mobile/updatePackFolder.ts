import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BundleInfo, UpdateManifest } from "@akanjs/native/api";
import type { NativeEnv } from "akanjs";
import { ExitCodeError } from "../commandDecorators/exitCodeError";
import type { MobilePlatform } from "./mobileTarget";

export interface NativeUpdatePackCompat {
  /** The store build's bundle.json the pack was compared with. */
  against: string;
  compatible: boolean;
  problems: string[];
}

/** `<out>/pack.json`: what a signer needs of a pack, read instead of the log. */
export interface NativeUpdatePack {
  schema: 1;
  app: string;
  target: string;
  platform: MobilePlatform;
  env: NativeEnv;
  channel: string;
  appId: string;
  appVersion: string;
  nativeApi: string;
  /** bundle.json `web.hash`: the web files as served, the part of a bundle id that names its content. */
  webHash: string;
  files: number;
  size: number;
  /** The folder it was read from or packed to; pack.json leaves it out. */
  out: string;
  compat?: NativeUpdatePackCompat;
}

//* The folder `akan pack-update` writes for a signer or Akan Cloud: the native build API writes `files/<sha256>`,
//* bundle.json and manifest.template.json, and akan writes pack.json and compat.json beside them.
export class UpdatePackFolder {
  static readonly packFile = "pack.json";
  static readonly compatFile = "compat.json";
  static readonly bundleFile = "bundle.json";
  static readonly templateFile = "manifest.template.json";
  static readonly filesDir = "files";
  static readonly #records = [
    UpdatePackFolder.templateFile,
    UpdatePackFolder.bundleFile,
    UpdatePackFolder.packFile,
    UpdatePackFolder.compatFile,
  ];
  static readonly #sha256 = /^[0-9a-f]{64}$/;

  /** akan's own records: a pack that fails must not leave the previous pack's behind for whoever reads the exit code. */
  static async clear(dir: string) {
    await Promise.all(
      [UpdatePackFolder.packFile, UpdatePackFolder.compatFile].map((name) => rm(path.join(dir, name), { force: true })),
    );
  }

  /** A pack read back from its folder wherever it was moved. */
  static async read(dir: string): Promise<NativeUpdatePack> {
    const file = Bun.file(path.join(dir, UpdatePackFolder.packFile));
    if (!(await file.exists()))
      throw new Error(`${dir} holds no ${UpdatePackFolder.packFile}: give the folder \`akan pack-update\` wrote.`);
    const pack = (await file.json()) as NativeUpdatePack;
    if (pack.schema !== 1)
      throw new Error(`${dir}/${UpdatePackFolder.packFile} is schema ${pack.schema}, and this akan reads schema 1.`);
    return { ...pack, out: path.resolve(dir) };
  }

  //? Without `out`: the record travels in the pack's archive, and the folder is wherever it is read from.
  static async write({ out, ...record }: NativeUpdatePack) {
    await Bun.write(path.join(out, UpdatePackFolder.packFile), `${JSON.stringify(record, null, 2)}\n`);
  }

  static async writeCompat(pack: NativeUpdatePack, compat: NativeUpdatePackCompat) {
    pack.compat = compat;
    await Bun.write(path.join(pack.out, UpdatePackFolder.compatFile), `${JSON.stringify(compat, null, 2)}\n`);
  }

  /** The bundle.json a store build and a pack both carry. */
  static async readBundle(file: string): Promise<BundleInfo> {
    return (await Bun.file(file).json()) as BundleInfo;
  }

  //* Exit 2, not a thrown 1: a CI tells "this needs a new store build" apart from a pack that broke.
  static storeBuildVerdict({ out, compat }: Pick<NativeUpdatePack, "out" | "compat">, then?: string) {
    if (!compat || compat.compatible) return null;
    return new ExitCodeError(
      `The pack in ${out} needs a new store build; it differs from the one ${compat.against} came from:\n- ${compat.problems.join("\n- ")}${then ? `\n${then}` : ""}`,
      2,
    );
  }

  /** The pack as the tgz Akan Cloud takes: the files its manifest template lists, and the records beside them. */
  static async withArchive<T>(pack: NativeUpdatePack, use: (archive: string) => Promise<T>): Promise<T> {
    const { templateFile, filesDir } = UpdatePackFolder;
    const template = Bun.file(path.join(pack.out, templateFile));
    if (!(await template.exists()))
      throw new Error(`${pack.out} holds no ${templateFile}: give the folder \`akan pack-update\` wrote.`);
    const { files = [] } = (await template.json()) as Partial<UpdateManifest>;
    const hashes = [...new Set(files.map((file) => file.sha256 as unknown))];
    if (!hashes.every((hash): hash is string => typeof hash === "string" && UpdatePackFolder.#sha256.test(hash)))
      throw new Error(`${pack.out}/${templateFile} lists a file whose sha256 is not 64 hex digits.`);
    const present = await Promise.all(
      UpdatePackFolder.#records.map((name) => Bun.file(path.join(pack.out, name)).exists()),
    );
    const entries = [
      ...UpdatePackFolder.#records.filter((_, idx) => present[idx]),
      ...hashes.map((hash) => `${filesDir}/${hash}`),
    ];
    const dir = await mkdtemp(path.join(os.tmpdir(), "akan-pack-"));
    try {
      //? files/ keeps every earlier pack's files (content-addressed), so the folder itself is not the pack; the names
      //? go on stdin, not argv, because a Windows command line holds 32 KiB.
      // A relative archive name, so GNU tar never reads a Windows drive letter (`C:\…`) as a remote `host:file` spec.
      const tar = Bun.spawn(["tar", "-czf", "pack.tgz", "-C", pack.out, "-T", "-"], {
        cwd: dir,
        stdin: new Blob([entries.map((entry) => `./${entry}\n`).join("")]),
        stdout: "ignore",
        stderr: "pipe",
      });
      const [code, stderr] = await Promise.all([tar.exited, new Response(tar.stderr).text()]);
      if (code !== 0) throw new Error(`tar of ${pack.out} failed: ${stderr.trim()}`);
      return await use(path.join(dir, "pack.tgz"));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
