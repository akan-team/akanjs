import { serve } from "@akanjs/service";
import type { BlobStorageApi } from "@util/nest";

export class LocalFileService extends serve("localFile" as const, ({ use }) => ({
  blobStorageApi: use<BlobStorageApi>(),
})) {
  async readLocalFile(path: string) {
    return await this.blobStorageApi.readData(path);
  }
}
