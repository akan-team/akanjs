import type { BlobStorageApi } from "@libs/util/srvkit";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export class MemoService extends serve(db.memo, ({ use }) => ({
  blobStorageApi: use<BlobStorageApi>(),
})) {
  static readonly imageLimit = 5 * 1024 * 1024;
  //? The stored name takes its extension from the type checked here, never from the uploaded name: the file is
  //? served by that extension, and an `x.html` sent as image/png would otherwise be stored as a page.
  static readonly imageExtensions: { readonly [type: string]: string | undefined } = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  async attachImage(memoId: string, upload: File) {
    const image = await (upload as unknown as Promise<File>);
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
