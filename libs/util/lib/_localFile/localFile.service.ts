import type { BlobStorageApi } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import { Err } from "../dict";

export class LocalFileService extends serve("localFile" as const, ({ use }) => ({
  blobStorageApi: use<BlobStorageApi>(),
})) {
  async readLocalFile(path: string) {
    if (path.startsWith("private/")) throw new Err("localFile.error.privateFilesNotServed");
    return await this.blobStorageApi.readData(path);
  }

  //? Typed by the stored name and never sniffed: with no Content-Type a browser renders an uploaded page as HTML
  //? on the API's origin, whatever the uploader declared it to be.
  async serveLocalFile(path: string) {
    return new Response(await this.readLocalFile(path), {
      headers: { "content-type": Bun.file(path).type, "x-content-type-options": "nosniff" },
    });
  }
}
