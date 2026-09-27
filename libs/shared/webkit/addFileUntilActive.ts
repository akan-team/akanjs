import { type cnst, fetch } from "@libs/shared/client";
import { sleep } from "akanjs/common";
import type { ProtoFile } from "akanjs/constant";

// The server gives up on an upload with no progress for 15 minutes; a screen stops waiting well before that.
const pollDeadlineMs = 2 * 60 * 1000;

export const addFileUntilActive = async (
  fileData: File,
  addFilesGql: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>,
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void,
) => {
  onProgress?.({ loaded: 1, total: 100, percentage: 1 });
  let [file] = await addFilesGql([fileData] as unknown as FileList);
  onProgress?.({ loaded: file.progress ?? 10, total: 100, percentage: file.progress ?? 10 });
  const deadline = Date.now() + pollDeadlineMs;
  while (file.status === "uploading" && Date.now() < deadline) {
    await sleep(1000);
    file = await fetch.file(file.id);
    onProgress?.({ loaded: file.progress ?? 90, total: 100, percentage: file.progress ?? 90 });
  }
  onProgress?.({ loaded: 100, total: 100, percentage: 100 });
  return file;
};
