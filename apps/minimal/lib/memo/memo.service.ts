import type { BlobStorageApi } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export class MemoService extends serve(db.memo, ({ use }) => ({
  blobStorageApi: use<BlobStorageApi>(),
})) {
  static readonly imageLimit = 5 * 1024 * 1024;

  async attachImage(memoId: string, upload: File) {
    const image = await (upload as unknown as Promise<File>);
    if (!image.type.startsWith("image/") || image.size > MemoService.imageLimit)
      throw new Err("memo.error.imageRejected");
    const memo = await this.getMemo(memoId);
    const filename = image.name.replace(/[^A-Za-z0-9._-]/g, "") || "image";
    const { url } = await this.blobStorageApi.uploadDataFromReadableStream({
      path: `memo/${memo.id}/${Date.now()}-${filename}`,
      body: image.stream(),
      mimetype: image.type,
    });
    return await memo.set({ imageUrl: url }).save();
  }
}
