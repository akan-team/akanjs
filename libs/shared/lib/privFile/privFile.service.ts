import { FileManager, StorageApi } from "@libs/util/srvkit";
import { dayjs } from "akanjs/base";
import { createDocumentId } from "akanjs/document";
import type { LocalFile } from "akanjs/server";
import { serve } from "akanjs/service";

import * as db from "../db";
import { Err } from "../dict";

export class PrivFileService extends serve(db.privFile, ({ plug }) => ({
  privStorageApi: plug(StorageApi),
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
    const id = createDocumentId();
    const privatePath = PrivFileService.privatePathOf(id, localFile.filename, purpose, group);
    const privFile = await this._createUploading(id, privatePath, alias, { ...localFile, size });
    try {
      await this.privStorageApi.uploadDataFromLocal({
        path: privatePath,
        localPath: localFile.localPath,
        access: "private",
      });
    } catch (error) {
      await this._discardUpload(privFile.id);
      throw error;
    }
    await this.privFileModel.finishUpload(privFile.id, privatePath);
    return privFile.set({ progress: 100, status: "active" });
  }

  async addPrivFileFromStream(
    body: ReadableStream<Uint8Array>,
    file: { filename: string; mimetype: string; encoding: string },
    purpose: string,
    group = "default",
    { alias = file.filename }: { alias?: string } = {},
  ): Promise<db.PrivFile> {
    const id = createDocumentId();
    const privatePath = PrivFileService.privatePathOf(id, file.filename, purpose, group);
    const privFile = await this._createUploading(id, privatePath, alias, { ...file, size: 0 });
    const uploaded = await this.privStorageApi
      .uploadDataFromReadableStream({ path: privatePath, body, mimetype: file.mimetype, access: "private" })
      .catch(async (error: unknown) => {
        await this._discardUpload(privFile.id);
        throw error;
      });
    await this.privFileModel.finishUpload(privFile.id, privatePath, { size: uploaded.size });
    return privFile.set({ size: uploaded.size, progress: 100, status: "active" });
  }

  /**
   * A privFile row plus a URL a remote uploader PUTs the object to directly, so the bytes never pass through
   * this server and the uploader holds no storage credential. `finishUploadTarget` activates it once the upload
   * is known to have landed.
   */
  async createUploadTarget(
    file: { filename: string; mimetype: string; encoding: string },
    purpose: string,
    group = "default",
    { alias = file.filename, expiresInSec = 3600 }: { alias?: string; expiresInSec?: number } = {},
  ) {
    const id = createDocumentId();
    const privatePath = PrivFileService.privatePathOf(id, file.filename, purpose, group);
    const uploadUrl = this.privStorageApi.presignUpload(privatePath, expiresInSec);
    if (!uploadUrl) throw new Err("privFile.error.presignUnsupported");
    const privFile = await this._createUploading(id, privatePath, alias, { ...file, size: 0 });
    return { privFile, uploadUrl };
  }

  async finishUploadTarget(privFileId: string) {
    const privFile = await this.getPrivFile(privFileId);
    const privatePath = privFile.privatePath;
    if (!privatePath) throw new Err("privFile.error.privateFilePathEmpty");
    const size = await this.privStorageApi.getDataSize(privatePath);
    if (size === null) throw new Err("privFile.error.uploadNotFound");
    await this.privFileModel.finishUpload(privFile.id, privatePath, { size });
    return privFile.set({ size, progress: 100, status: "active" });
  }

  async createDownloadUrl(
    privFileOrId: db.PrivFile | string,
    { expiresInSec = 300, filename }: { expiresInSec?: number; filename?: string } = {},
  ) {
    const privFile = typeof privFileOrId === "string" ? await this.getPrivFile(privFileOrId) : privFileOrId;
    if (!privFile.privatePath) throw new Err("privFile.error.privateFilePathEmpty");
    const url = this.privStorageApi.presignDownload(privFile.privatePath, expiresInSec, {
      filename: filename ?? privFile.filename,
    });
    if (!url) throw new Err("privFile.error.downloadPresignUnsupported");
    return url;
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

  async removeStaleUploads() {
    const staleFiles = await this.privFileModel.listStaleUploads(dayjs().subtract(1, "day"));
    for (const privFile of staleFiles) await this._discardUpload(privFile.id);
    return staleFiles.length;
  }

  private async _createUploading(
    id: string,
    privatePath: string,
    alias: string,
    { filename, mimetype, encoding, size }: { filename: string; mimetype: string; encoding: string; size: number },
  ) {
    return await this.privFileModel.createPrivFile({
      id,
      alias,
      filename,
      mimetype,
      encoding,
      privatePath,
      size,
      progress: 0,
      status: "uploading",
    });
  }

  //? The row is already soft-removed when `_postRemove` deletes the object, so a failed delete only leaves bytes behind.
  private async _discardUpload(privFileId: string) {
    await this.removePrivFile(privFileId).catch((error: unknown) => {
      this.logger.warn(`Failed to delete the object of privFile ${privFileId} after its upload stopped: ${error}`);
    });
  }

  static privatePathOf(id: string, filename: string, purpose: string, group: string | null) {
    const segmentOf = (value: string | null) => value?.replace(/[^A-Za-z0-9_-]/g, "") || "default";
    const ext = /\.([A-Za-z0-9]{1,10})$/.exec(filename)?.[1];
    return `private/${segmentOf(purpose)}/${segmentOf(group)}/${id}${ext ? `.${ext}` : ""}`;
  }
}
