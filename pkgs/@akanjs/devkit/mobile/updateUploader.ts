import path from "node:path";

/** What the uploader needs of an S3 client; Bun.S3Client is one. */
export interface UpdateBucket {
  exists(key: string): Promise<boolean>;
  write(key: string, data: Blob, options?: { type?: string }): Promise<number>;
}

export interface UpdateUploadResult {
  uploaded: number;
  skipped: number;
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

  constructor(
    readonly bucket: UpdateBucket,
    readonly prefix: string,
  ) {}

  static forTarget(target: string): UpdateUploader {
    const { bucket, prefix } = UpdateUploader.parseTarget(target);
    return new UpdateUploader(new Bun.S3Client({ bucket }), prefix);
  }

  async upload(dir: string): Promise<UpdateUploadResult> {
    const files: string[] = [];
    for await (const file of new Bun.Glob("**/*").scan({ cwd: dir, onlyFiles: true })) {
      if (!file.endsWith(".tmp")) files.push(file.split(path.sep).join("/"));
    }
    const { releases, manifests } = UpdateUploader.order(files);
    const keyOf = (file: string) => (this.prefix ? `${this.prefix}/${file}` : file);
    let uploaded = 0;
    let skipped = 0;
    for (const file of releases) {
      if (await this.bucket.exists(keyOf(file))) {
        skipped++;
        continue;
      }
      await this.bucket.write(keyOf(file), Bun.file(path.join(dir, file)));
      uploaded++;
    }
    for (const file of manifests) {
      const type = file.endsWith(".json") ? "application/json" : "text/plain";
      await this.bucket.write(keyOf(file), Bun.file(path.join(dir, file)), { type });
      uploaded++;
    }
    return { uploaded, skipped };
  }
}
