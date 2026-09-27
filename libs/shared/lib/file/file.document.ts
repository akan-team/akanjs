import { type Dayjs, ID } from "akanjs/base";
import { by, from, into, documentQueryHelper as q, type SchemaOf } from "akanjs/document";
import * as cnst from "../cnst";
import type * as db from "../db";

export class FileFilter extends from(cnst.File, (filter) => ({
  query: {
    byIds: filter()
      .arg("ids", [ID])
      .query((ids, q) => ({ id: q.oneOf(ids) })),
    byFilename: filter()
      .arg("filename", String)
      .query((filename) => ({ filename })),
    byOrigin: filter()
      .arg("origin", String)
      .query((origin) => ({ origin, status: "active" })),
  },
  sort: {},
})) {}

export class File extends by(cnst.File) {}

export class FileModel extends into(File, FileFilter, cnst.file, () => ({})) {
  static override _onSchema(schema: SchemaOf<FileModel, File>) {
    schema.index({ filename: "text" });
    schema.index({ status: 1, updatedAt: 1 });
  }
  async progressUpload(id: string, loadSize: number | undefined, totalSize: number) {
    await this.File.updateOne({ id }, { progress: Math.floor(((loadSize ?? 0) / (totalSize || 1)) * 100) });
  }
  async finishUpload(id: string, url: string, data: Partial<db.FileInput>) {
    return this.File.updateOne({ id }, { ...data, url, progress: 100, status: "active" });
  }
  // uploading -> failed: no progress since `idleSince`, so the instance streaming it is gone and nothing will finish it.
  async failStaleUploads(idleSince: Dayjs) {
    const { modifiedCount } = await this.File.updateMany(
      { status: "uploading", updatedAt: q.lt(idleSince.toDate()) },
      { status: "failed" },
    );
    return modifiedCount;
  }
  async generateFile(data: Partial<db.File>): Promise<db.File> {
    if (data.id) {
      const existingFile = await this.File.findById(data.id);
      const doc = existingFile?.set(data) ?? new this.File({ id: data.id, ...data } as unknown as db.FileInput);
      return await doc.save();
    } else {
      return await new this.File(data).save();
    }
  }
}
