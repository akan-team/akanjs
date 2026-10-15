import { BlobStorageApi, isPathWithin } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import { Err } from "../dict";

export class LocalFileService extends serve("localFile" as const, ({ plug }) => ({
  blobStorageApi: plug(BlobStorageApi),
})) {
  //? An uploaded page or SVG would run on the API's origin; <img> and <video> ignore this, a PDF viewer refuses it.
  static readonly sandbox = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

  async readLocalFile(path: string) {
    if (path.startsWith("private/")) throw new Err("localFile.error.privateFilesNotServed");
    //? Checked after decoding: `..%2F` reaches here as `../`, and nothing outside the public root may be read.
    if (!isPathWithin(this.blobStorageApi.root, path))
      throw new Err("localFile.error.fileNotFound", undefined, { statusCode: 404 });
    if ((await this.blobStorageApi.getDataSize(path)) === null)
      throw new Err("localFile.error.fileNotFound", undefined, { statusCode: 404 });
    return await this.blobStorageApi.readData(path);
  }

  //? No Content-Type: Bun.serve types a file body by its name, and the API router buffers and compresses a typed one.
  async serveLocalFile(encodedPath: string) {
    const path = LocalFileService.decodePath(encodedPath);
    const headers = new Headers({ "x-content-type-options": "nosniff" });
    if (Bun.file(path).type !== "application/pdf") headers.set("content-security-policy", LocalFileService.sandbox);
    return new Response(await this.readLocalFile(path), { headers });
  }

  //? A malformed escape stays as it is, so the lookup simply misses and answers 404.
  static decodePath(encodedPath: string) {
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }
}
