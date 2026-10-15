import { formatBytes } from "@libs/util/common";
import { dayjs, Int } from "akanjs/base";
import { via } from "akanjs/constant";

import { FileStatus } from "../file/file.constant";

export class PrivFileInput extends via((field) => ({
  alias: field(String, { text: "title" }),
  filename: field.hidden(String).optional(),
  mimetype: field(String, { text: "filter" }),
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
    return formatBytes(this.size);
  }
}

export class PrivFile extends via(PrivFileObject, LightPrivFile, (resolve) => ({})) {}

export class PrivFileInsight extends via(PrivFile, (field) => ({})) {}
