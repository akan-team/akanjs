import { store } from "akanjs/store";

import { fetch, sig } from "../useClient";

export class MemoStore extends store(sig.memo, () => ({
  // state
})) {
  // action
  async attachMemoImage(memoId: string, fileList: FileList | File[]) {
    if (!fileList.length) return;
    this.setMemo(await fetch.attachMemoImage(fileList, memoId));
  }
}
