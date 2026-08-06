import { FileManager, type StorageApi } from "@libs/util/srvkit";
import type { LocalFile } from "akanjs/server";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export class PrivFileService extends serve(db.privFile, ({ use }) => ({
  privStorageApi: use<StorageApi>(),
})) {
  override async _postRemove(privFile: db.PrivFile) {
    if (privFile.privatePath) await this.privStorageApi.deleteDataByPath(privFile.privatePath);
    return privFile;
  }

  async addPrivFileFromLocal(
    localFile: LocalFile,
    purpose: string,
    group = "default",
    { alias = localFile.filename }: { alias?: string } = {},
  ): Promise<db.PrivFile> {
    const { size } = await FileManager.getFileStat(localFile);
    const privFile = await this.privFileModel.generatePrivFile({
      alias,
      filename: localFile.filename,
      mimetype: localFile.mimetype,
      encoding: localFile.encoding,
      privatePath: "",
      size,
      progress: 0,
      status: "uploading",
    });
    const privatePath = this._getPrivatePath(privFile, purpose, group);
    await this.privStorageApi.uploadDataFromLocal({
      path: privatePath,
      localPath: localFile.localPath,
      access: "private",
    });
    await this.privFileModel.finishUpload(privFile.id, privatePath);
    return privFile.set({ privatePath, progress: 100, status: "active" });
  }

  async addPrivFileFromStream(
    body: ReadableStream<Uint8Array>,
    file: { filename: string; mimetype: string; encoding: string },
    purpose: string,
    group = "default",
    { alias = file.filename }: { alias?: string } = {},
  ): Promise<db.PrivFile> {
    const privFile = await this.privFileModel.generatePrivFile({
      alias,
      filename: file.filename,
      mimetype: file.mimetype,
      encoding: file.encoding,
      privatePath: "",
      size: 0,
      progress: 0,
      status: "uploading",
    });
    const privatePath = this._getPrivatePath(privFile, purpose, group);
    const uploaded = await this.privStorageApi.uploadDataFromReadableStream({
      path: privatePath,
      body,
      mimetype: file.mimetype,
      access: "private",
    });
    await this.privFileModel.finishUpload(privFile.id, privatePath, { size: uploaded.size });
    return privFile.set({ privatePath, size: uploaded.size, progress: 100, status: "active" });
  }

  async readPrivFile(privFileOrId: db.PrivFile | string) {
    const privFile = typeof privFileOrId === "string" ? await this.getPrivFile(privFileOrId) : privFileOrId;
    return await this.readData(privFile);
  }

  async readData(privFile: db.PrivFile) {
    if (!privFile.privatePath) throw new Err("privFile.error.privateFilePathEmpty");
    return await this.privStorageApi.readData(privFile.privatePath);
  }

  async readText(privFileOrId: db.PrivFile | string) {
    return await new Response(await this.readPrivFile(privFileOrId)).text();
  }

  async readJson<T = unknown>(privFileOrId: db.PrivFile | string) {
    return JSON.parse(await this.readText(privFileOrId)) as T;
  }

  async readArrayBuffer(privFileOrId: db.PrivFile | string) {
    return await new Response(await this.readPrivFile(privFileOrId)).arrayBuffer();
  }

  async saveToLocal(privFileOrId: db.PrivFile | string, localPath: string) {
    const privFile = typeof privFileOrId === "string" ? await this.getPrivFile(privFileOrId) : privFileOrId;
    if (!privFile.privatePath) throw new Err("privFile.error.privateFilePathEmpty");
    return await this.privStorageApi.saveData({ path: privFile.privatePath, localPath });
  }

  async deletePrivFile(privFileOrId: db.PrivFile | string) {
    const privFile = typeof privFileOrId === "string" ? await this.getPrivFile(privFileOrId) : privFileOrId;
    return await this.removePrivFile(privFile.id);
  }

  private _getPrivatePath(privFile: db.PrivFile, purpose: string, group: string | null) {
    const split = (privFile.filename ?? privFile.alias).split(".");
    const ext = split.length > 1 ? `.${split.at(-1)}` : "";
    return `private/${purpose.length ? purpose : "default"}/${group?.length ? group : "default"}/${privFile.id}${ext}`;
  }
}
