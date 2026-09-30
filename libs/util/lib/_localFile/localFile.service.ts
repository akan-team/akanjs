import type { BlobStorageApi } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import { Err } from "../dict";

export class LocalFileService extends serve("localFile" as const, ({ use }) => ({
  blobStorageApi: use<BlobStorageApi>(),
})) {
  //? An uploaded page or SVG would run on the API's origin; <img> and <video> ignore this, a PDF viewer refuses it.
  static readonly sandbox = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

  async readLocalFile(path: string) {
    if (path.startsWith("private/")) throw new Err("localFile.error.privateFilesNotServed");
    return await this.blobStorageApi.readData(path);
  }

  //? No Content-Type: Bun.serve types a file body by its name, and the API router buffers and compresses a typed one.
  async serveLocalFile(path: string) {
    const headers = new Headers({ "x-content-type-options": "nosniff" });
    if (Bun.file(path).type !== "application/pdf") headers.set("content-security-policy", LocalFileService.sandbox);
    return new Response(await this.readLocalFile(path), { headers });
  }
}
