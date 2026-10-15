import { formatBytes } from "@libs/util/common";
import { dayjs, enumOf, Int } from "akanjs/base";
import { type ProtoFile, via } from "akanjs/constant";

export class FileStatus extends enumOf("fileStatus", ["active", "uploading", "failed"] as const) {}

export class FileInput extends via((field) => ({
  filename: field(String, { text: "title" }),
  mimetype: field(String),
  encoding: field.hidden(String),
  imageSize: field<[number, number]>([Int], { default: [0, 0] }),
  url: field(String, { default: "" }),
  abstractData: field.visual(String).optional(),
  size: field(Int, { default: 0 }),
  origin: field.hidden(String).optional(),
})) {}

export class FileObject
  extends via(FileInput, (field) => ({
    lastModifiedAt: field(Date, { default: () => dayjs() }),
    progress: field(Int).optional(),
    status: field(FileStatus, { default: "uploading" }),
  }))
  implements ProtoFile {}

export class LightFile extends via(
  FileObject,
  ["filename", "imageSize", "url", "size", "abstractData", "status"] as const,
  (resolve) => ({}),
) {
  getFileSizeStr() {
    return formatBytes(this.size);
  }
}

export class File extends via(FileObject, LightFile, (resolve) => ({})) {}

export class FileInsight extends via(File, (field) => ({})) {}
