import { readdir } from "node:fs/promises";
import path from "node:path";
import type { UpdateEnvelope, UpdateManifest } from "@akanjs/native/api";
import { isRecord } from "akanjs/common";
import { UpdatePackFolder } from "./updatePackFolder";

/** What the uploader needs of an S3 client; Bun.S3Client is one. */
export interface UpdateBucket {
  exists(key: string): Promise<boolean>;
  write(key: string, data: Blob, options?: { type?: string }): Promise<number>;
}

export interface UpdateUploadResult {
  uploaded: number;
  skipped: number;
}

/** The release one `publish-update` wrote, as it reports it. */
export interface PublishedUpdate {
  /** `<updates>/<os>-<arch>` for a desktop app, `<updates>/<platform>` for a phone's web bundle. */
  dir: string;
  channel: string;
  /** Its manifest's `bundle`, which tells it from the other manifests of the channel there. */
  bundle: string;
}

//* A manifest names files that must already be there, so they go first and the manifests last, each signature before
//* its manifest as `publish-update` writes them. A release file never changes once published (its name carries its
//* hash), so one the bucket holds is skipped; a manifest is always written.
export class UpdateUploader {
  static readonly #manifest = /\.json(?:\.sig)?$/;

  /** `s3://bucket/prefix`: the credentials and endpoint come from S3_* (or AWS_*) in the environment. */
  static parseTarget(target: string): { bucket: string; prefix: string } {
    const match = /^s3:\/\/([^/]+)\/?(.*)$/.exec(target.trim());
    if (!match?.[1]) throw new Error(`--upload takes s3://<bucket>/<prefix>, not ${JSON.stringify(target)}.`);
    return { bucket: match[1], prefix: (match[2] ?? "").replace(/\/+$/, "") };
  }

  static order(files: string[]): { releases: string[]; manifests: string[] } {
    const manifests = files.filter((file) => UpdateUploader.#manifest.test(file));
    return {
      releases: files.filter((file) => !UpdateUploader.#manifest.test(file)).sort((a, b) => a.localeCompare(b)),
      manifests: manifests.sort(
        (a, b) => Number(a.endsWith(".json")) - Number(b.endsWith(".json")) || a.localeCompare(b),
      ),
    };
  }

  //* Never the whole folder: pack-update's records sit there too, and so do manifests of other channels and native
  //* APIs, which a later publish from another machine may have replaced.
  static async releaseFiles(updatesDir: string, { dir, channel, bundle }: PublishedUpdate): Promise<string[]> {
    const keyOf = (file: unknown) => UpdateUploader.#keyOf(updatesDir, dir, file);
    const desktop = await UpdateUploader.#read<UpdateManifest>(path.join(dir, `${channel}.json`));
    if (desktop?.bundle === bundle) {
      const archive = desktop.archive?.url;
      const patches = UpdateUploader.#field(desktop.patches, "url");
      return [archive, ...patches, `${channel}.json.sig`, `${channel}.json`].map(keyOf);
    }
    const names = await readdir(path.join(dir, channel)).catch(() => [] as string[]);
    for (const name of names.filter((name) => name.endsWith(".json"))) {
      const envelope = await UpdateUploader.#read<UpdateEnvelope>(path.join(dir, channel, name));
      const manifest =
        typeof envelope?.manifest === "string"
          ? UpdateUploader.#parse<UpdateManifest>(Buffer.from(envelope.manifest, "base64").toString("utf8"))
          : null;
      if (manifest?.bundle !== bundle) continue;
      const hashes = [...new Set(UpdateUploader.#field(manifest.files, "sha256"))];
      if (!hashes.every((hash): hash is string => typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash)))
        throw new Error(
          `${path.join(dir, channel, name)} lists a file whose sha256 is not 64 hex digits; nothing was uploaded.`,
        );
      return [...hashes.map((hash) => `${UpdatePackFolder.filesDir}/${hash}`), `${channel}/${name}`].map(keyOf);
    }
    throw new Error(`${dir} holds no ${channel} manifest of release ${bundle}; nothing was uploaded.`);
  }

  static #keyOf(updatesDir: string, dir: string, file: unknown) {
    const resolved = typeof file === "string" ? path.resolve(dir, file) : "";
    const key = path.relative(updatesDir, resolved);
    if (!resolved.startsWith(`${path.resolve(dir)}${path.sep}`) || key.startsWith("..") || path.isAbsolute(key))
      throw new Error(
        `The release in ${dir} names ${typeof file === "string" ? JSON.stringify(file) : "a file with no path"}, which is not inside that folder; nothing was uploaded.`,
      );
    return key.split(path.sep).join("/");
  }

  static #field(list: unknown, key: string): unknown[] {
    return Array.isArray(list) ? list.map((item) => (isRecord(item) ? item[key] : undefined)) : [];
  }

  static async #read<T>(file: string) {
    const text = await Bun.file(file)
      .text()
      .catch(() => "");
    return UpdateUploader.#parse<T>(text);
  }

  static #parse<T>(text: string): Partial<T> | null {
    try {
      const value: unknown = JSON.parse(text);
      return isRecord(value) ? (value as Partial<T>) : null;
    } catch {
      return null;
    }
  }

  constructor(
    readonly bucket: UpdateBucket,
    readonly prefix: string,
  ) {}

  static forTarget(target: string): UpdateUploader {
    const { bucket, prefix } = UpdateUploader.parseTarget(target);
    return new UpdateUploader(new Bun.S3Client({ bucket }), prefix);
  }

  async upload(updatesDir: string, release: PublishedUpdate): Promise<UpdateUploadResult> {
    const { releases, manifests } = UpdateUploader.order(await UpdateUploader.releaseFiles(updatesDir, release));
    const keyOf = (file: string) => (this.prefix ? `${this.prefix}/${file}` : file);
    let uploaded = 0;
    let skipped = 0;
    for (const file of releases) {
      if (await this.bucket.exists(keyOf(file))) {
        skipped++;
        continue;
      }
      await this.bucket.write(keyOf(file), Bun.file(path.join(updatesDir, file)));
      uploaded++;
    }
    for (const file of manifests) {
      const type = file.endsWith(".json") ? "application/json" : "text/plain";
      await this.bucket.write(keyOf(file), Bun.file(path.join(updatesDir, file)), { type });
      uploaded++;
    }
    return { uploaded, skipped };
  }
}
