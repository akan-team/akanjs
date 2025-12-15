import { ID, Int } from "@akanjs/base";
import { via } from "@akanjs/constant";

export class FileMeta extends via((field) => ({
  fileId: field(ID).optional(),
  lastModifiedAt: field(Date),
  size: field(Int),
})) {}
