import { type cnst, fetch } from "@libs/shared/client";
import { capitalize } from "akanjs/common";
import type { ProtoFile } from "akanjs/constant";
import type { SliceMeta } from "akanjs/fetch";

type SliceUpload = (fileList: FileList | File[], parentId?: string) => Promise<ProtoFile[]>;

export const sliceUploadOf = (slice: SliceMeta) =>
  (fetch as unknown as Record<string, SliceUpload>)[`add${capitalize(slice.sliceName)}Files`];

export const filesOf = (files: File | File[] | FileList) =>
  files instanceof FileList ? [...files] : Array.isArray(files) ? files : [files];

export const uploaderOf =
  <T extends cnst.LightFile>(slice: SliceMeta) =>
  async (files: File | File[] | FileList) =>
    (await sliceUploadOf(slice)(filesOf(files))) as unknown as T[];

export const replaced = <T extends cnst.LightFile>(files: T[], updatedFiles: T[]) =>
  files.map((file) => updatedFiles.find((updatedFile) => updatedFile.id === file.id) ?? file);
