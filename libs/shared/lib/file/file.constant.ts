import { dayjs, enumOf, Int } from "@akanjs/base";
import { ProtoFile, via } from "@akanjs/constant";

export class FileStatus extends enumOf("fileStatus", ["active", "uploading"]) {}

export class FileInput extends via((field) => ({
  filename: field(String),
  mimetype: field(String),
  encoding: field(String),
  imageSize: field<[number, number]>([Int], { default: [0, 0] }),
  url: field(String, { default: "" }),
  abstractData: field(String).optional(),
  size: field(Int, { default: 0 }),
  origin: field(String).optional(),
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
  (resolve) => ({})
) {
  getFileSizeStr() {
    const size = this.size;
    if (size < 1024) return `1 KB`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
    if (size < 1024 * 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
    return `${(size / 1024 / 1024 / 1024 / 1024).toFixed(2)} TB`;
  }
}

export class File extends via(FileObject, LightFile, (resolve) => ({})) {}

export class FileInsight extends via(File, (field) => ({})) {}
