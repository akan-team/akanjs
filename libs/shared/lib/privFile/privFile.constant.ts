import { dayjs, Int } from "akanjs/base";
import { via } from "akanjs/constant";

import { FileStatus } from "../file/file.constant";

export class PrivFileInput extends via((field) => ({
  alias: field(String),
  filename: field.hidden(String).optional(),
  mimetype: field(String),
  encoding: field(String),
  privatePath: field.hidden(String).optional(),
  size: field(Int, { default: 0 }),
})) {}

export class PrivFileObject extends via(PrivFileInput, (field) => ({
  lastModifiedAt: field(Date, { default: () => dayjs() }),
  progress: field(Int).optional(),
  status: field(FileStatus, { default: "uploading" }),
})) {}

export class LightPrivFile extends via(
  PrivFileObject,
  ["alias", "size", "status", "lastModifiedAt"] as const,
  (resolve) => ({}),
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

export class PrivFile extends via(PrivFileObject, LightPrivFile, (resolve) => ({})) {}

export class PrivFileInsight extends via(PrivFile, (field) => ({})) {}
