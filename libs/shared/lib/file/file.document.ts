import { beyond, by, from, into, type SchemaOf } from "@akanjs/document";

import * as cnst from "../cnst";
import type * as db from "../db";

export class FileFilter extends from(cnst.File, (filter) => ({
  query: {
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
  async progressUpload(id: string, loadSize: number | undefined, totalSize: number) {
    await this.File.updateOne(
      { _id: id },
      { $set: { progress: Math.floor(((loadSize ?? 0) / (totalSize || 1)) * 100) } }
    );
  }
  async finishUpload(id: string, url: string, data: Partial<db.FileInput>) {
    return this.File.updateOne({ _id: id }, { $set: { ...data, url, progress: 100, status: "active" } });
  }
  async generateFile(data: Partial<File>) {
    if (data.id) {
      const existingFile = await this.File.findById(data.id);
      const doc = existingFile?.set(data) ?? new this.File({ _id: data.id, ...data });
      return await doc.save();
    } else {
      return await new this.File(data).save();
    }
  }
}

export class FileMiddleware extends beyond(FileModel, File) {
  onSchema(schema: SchemaOf<FileModel, File>) {
    schema.index({ filename: "text" });
  }
}
