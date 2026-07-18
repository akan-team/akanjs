import { by, from, into, type SchemaOf } from "akanjs/document";

import * as cnst from "../cnst";
import type * as db from "../db";

export class PrivFileFilter extends from(cnst.PrivFile, (filter) => ({
  query: {
    byAlias: filter()
      .arg("alias", String)
      .query((alias) => ({ alias })),
  },
  sort: {},
})) {}

export class PrivFile extends by(cnst.PrivFile) {}

export class PrivFileModel extends into(PrivFile, PrivFileFilter, cnst.privFile, () => ({})) {
  static override _onSchema(schema: SchemaOf<PrivFileModel, PrivFile>) {
    schema.index({ alias: "text" });
  }

  async progressUpload(id: string, loadSize: number | undefined, totalSize: number) {
    await this.PrivFile.updateOne({ id }, { progress: Math.floor(((loadSize ?? 0) / (totalSize || 1)) * 100) });
  }

  async finishUpload(id: string, privatePath: string, data: Partial<db.PrivFileInput> = {}) {
    return this.PrivFile.updateOne({ id }, { ...data, privatePath, progress: 100, status: "active" });
  }

  async generatePrivFile(data: Partial<db.PrivFile>): Promise<db.PrivFile> {
    if (data.id) {
      const existingFile = await this.PrivFile.findById(data.id);
      const doc = existingFile?.set(data) ?? new this.PrivFile({ id: data.id, ...data } as any);
      return await doc.save();
    }
    return await new this.PrivFile(data).save();
  }
}
