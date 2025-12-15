import { sleep } from "@akanjs/common";
import type { ProtoFile } from "@akanjs/constant";
import { cnst, fetch } from "@shared/client";

export const addFileUntilActive = async (
  fileData: File,
  addFilesGql: (fileList: FileList, id?: string) => Promise<(cnst.File | ProtoFile)[]>
) => {
  let [file] = await addFilesGql([fileData] as unknown as FileList);
  while (file.status === "uploading") {
    await sleep(1000);
    file = await fetch.file(file.id);
    if (file.status === "active") break;
  }
  return file;
};
