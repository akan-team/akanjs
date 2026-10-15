import type { Dayjs } from "akanjs/base";
import { by, from, into, documentQueryHelper as q, type SchemaOf } from "akanjs/document";

import * as cnst from "../cnst";
import type * as db from "../db";

export class PrivFileFilter extends from(cnst.PrivFile, (filter) => ({
  query: {},
  sort: {},
})) {}

export class PrivFile extends by(cnst.PrivFile) {}

export class PrivFileModel extends into(PrivFile, PrivFileFilter, cnst.privFile, () => ({})) {
  static override _onSchema(schema: SchemaOf<PrivFileModel, PrivFile>) {
    schema.index({ alias: "text" });
    schema.index({ status: 1, createdAt: 1 });
  }

  async finishUpload(id: string, privatePath: string, data: Partial<db.PrivFileInput> = {}) {
    return this.PrivFile.updateOne({ id }, { ...data, privatePath, progress: 100, status: "active" });
  }

  // uploading -> removed: a day unfinished means its uploader died mid-stream or its presigned URL expired unused.
  async listStaleUploads(createdBefore: Dayjs) {
    return await this.PrivFile.find({ status: "uploading", createdAt: q.lt(createdBefore.toDate()) }).limit(100);
  }
}
