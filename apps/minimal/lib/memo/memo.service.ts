import type { BlobStorageApi } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export class MemoService extends serve(db.memo, ({ use }) => ({
  blobStorageApi: use<BlobStorageApi>(),
})) {
  static readonly imageLimit = 5 * 1024 * 1024;
  static readonly imageExtensions: { readonly [type: string]: string | undefined } = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  async attachImage(memoId: string, upload: File | undefined) {
    if (!upload) throw new Err("memo.error.imageMissing");
    const image = await (upload as unknown as Promise<File>);
    //? Bun's formData() types an upload by its file name's extension and ignores the part's Content-Type.
    const extension = MemoService.imageExtensions[image.type];
    if (!extension || image.size > MemoService.imageLimit) throw new Err("memo.error.imageRejected");
    const memo = await this.getMemo(memoId);
    const { url } = await this.blobStorageApi.uploadDataFromReadableStream({
      path: `memo/${memo.id}/${Date.now()}.${extension}`,
      body: image.stream(),
      mimetype: image.type,
    });
    return await memo.set({ imageUrl: url }).save();
  }
}
