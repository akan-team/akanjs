# File Management

- Source: /cheatsheet/general/file
- Mirror: /llms/pages/cheatsheet/general/file.md
- Section: cheatsheet
- Category: General
- Priority: P2

## Headings

- What You Build (#what-you-build)
- Minimal File Model (#minimal-model)
- Upload Endpoint (#upload-endpoint)
- File Service (#file-service)
- Use In UI (#use-in-ui)
- Auto-attach To A Model Field (#auto-field)
- Remove The File With Its Owner (#cascade)
- Grow Later (#grow-later)
- Tips (#tips)

## Content

File Management

What You Build

A file feature splits one upload in two. The bytes go to storage, and the database keeps a File record that says where they are.

Where

- file.constant.ts, file.document.ts: **File model.** Stores the File record with its name, url, size, status and progress.

- file.signal.ts: **Upload endpoint.** Receives `Upload` files and hands them to the service.

- file.service.ts: **File service.** Creates the record, streams the bytes to storage, and saves the URL.

- StorageAdaptorRole: **Storage adaptor.** Where the bytes live; the default `BlobStorage` writes to local disk.

- file.store.ts, File.Util.tsx: **Store and UI.** Upload from a file input and show the result once it is `active`.

- localFile.getBlob: **Serve endpoint.** Ships in `@libs/util` and streams a local file back during development.

Every File starts as `uploading` and becomes `active` when storage returns its URL. The sections below build the pieces in this order.

**Already have `libs/shared`?** Its File module (`libs/shared/lib/file`) is the full version of this recipe, with image size, blur preview, dedupe by origin, and the `Field.Img` / `Field.File` controls.

Minimal File Model

Start with only the fields your UI needs. Image size, a blur preview or the origin URL can come later.

Field

- filename: The name the user picked, handed back as the download name.

- mimetype: The browser's type for the file, such as `image/png`.

- url: Where storage serves the bytes, empty until the upload finishes.

- size: The file size in bytes.

- status: `uploading` while the bytes move, `active` once storage answers with a URL.

- progress: Upload progress from 0 to 100.

- FilePurpose: Not a field but an enum: the folder a file goes to, since it becomes part of the storage path.

The constant file declares them, with the five classes every model has:

The service needs two writes on the model, one per progress tick and one when storage answers:

**`updateById` is one direct write.** It fires no hooks, which is fine for a progress tick.

**`finishUpload` is the `uploading → active` step.** It saves the URL and sets `progress` to 100 in the same write.

Upload Endpoint

Keep the endpoint boring. It takes the files and a purpose, and hands the real work to the service:

**An `Upload` argument makes the request multipart form data.** `fetch.uploadFiles` accepts a `FileList` or `File[]` and builds the form for you.

**`purpose` is an enum, so the server rejects any other value.** It becomes a folder name, and a free-form string would let the caller pick the folder.

**`get: User` gives the UI `fetch.file(id)`.** The UI uses it to re-read a record while it uploads.

**Agents never see this endpoint.** An endpoint that takes `Upload` is not published over MCP.

File Service

The service is the heart of the feature. For each file it does three things:

Create the record with status `uploading`.

Use the record id in the storage path, so filenames never collide.

When the upload finishes, save the returned URL and set the status to `active`.

**The upload is not awaited.** `uploadFile` returns the `uploading` record at once, and the two callbacks fill in progress and the URL later.

**The path is `<purpose>/<record id>`.** Two users can upload `photo.png` without a collision, and the filename the client sent never reaches a disk path.

**`BlobStorage` reports no progress.** It calls `uploadSuccess` once the write ends, so on local disk `progress` jumps from 0 to 100.

**`plug(StorageAdaptorRole)` names a role, not a vendor.** Swapping storage later leaves this file untouched.

Use In UI

The endpoint answers before storage finishes writing, so the record comes back as `uploading` with an empty `url`. Keep it in the store, re-read it until it is `active`, then show the `url`.

1. Upload and re-read in the store

One action uploads and keeps the record; the other refreshes it while it uploads:

2. Show it in a component

An image shows as a preview, and every file gets a download link:

**Components call `st.do`, never `fetch`.** The store action owns the request and writes the result into state.

**`useInterval` only polls while the file uploads.** `refreshUploadedFile` returns at once for an `active` file.

**Images show `url`; every file can be downloaded from it.** `download={filename}` restores the name the user picked, since the stored path holds only the id.

**A link goes through `resolveServerUrl`.** The stored `url` is relative to the server, and a page a native shell or a desktop app serves is on another origin. `Image` already resolves it.

Auto-attach To A Model Field

Writing that for every model gets repetitive. Mark one upload mutation with `{ fileUpload: true }`, and every model gets helpers that upload into its File fields:

You get

- fetch.add<Model>Files: Takes `(fileList, parentId?)` and posts the files, with `type` set to the model's name.

- st.do.upload<Field>On<Model>: Takes `(fileList, index?)`, fills a File field of the form, and re-reads it every 3 s.

- Field.Img, Field.Imgs, Field.File, Field.Files: Form controls in `@libs/shared/ui` that call `add<Model>Files` for the `slice` you pass.

The marked mutation takes four fixed body fields in this shape. For the service method it calls, see `FileService.addFiles` in `libs/shared/lib/file`:

The four fields

- files ([Upload]): The files, in the order they were picked.

- metas (String): A JSON array with one `{ lastModifiedAt, size }` per file.

- type (String): The owning model's name, such as `user`.

- parentId (ID, nullable): The id of the form being edited, left out when there is none.

**Mark exactly one mutation.** If two carry the flag, the first one found is used and a warning is printed.

**Put it in the File module's own signal.** The store action appears only on fields typed as the model whose signal holds the flag.

**Guard it like any mutation.** `Every` admits users and admins, since admin forms such as a banner editor upload too.

**No flag, no helpers.** Without it, `add<Model>Files` throws "File upload is not configured".

Remove The File With Its Owner

Add `cascade: "removeRef"` to a File relation, and removing the owner removes its files too. Mark the relation on the owner:

The cascade calls the File service, not the File model, so `FileService._postRemove` runs. Put the storage delete there and there is nothing else to wire:

**Arrays work too, but only on a relation.** A plain string id or an embedded scalar has no document to remove.

**Nothing checks for other owners.** `libs/shared`'s File dedupes by `origin`, so two documents can share one file; `removeRef` declares that this field owns it alone.

**Query-level removes skip the cascade.** `removeMany`, `removeById` and the generated `remove<Filter>` stamp `removedAt` in one atomic update and fire no hooks. Remove cascading documents one at a time.

**A cascade cannot be undone.** The document removal is soft (`removedAt`), but the storage delete is not, and restoring the owner does not bring its files back.

Grow Later

Start on local disk. Once the feature works, move to S3, R2 or MinIO by swapping the storage adaptor, not by rewriting the upload API.

- Local disk — `BlobStorage` — The default and the easiest to debug. Files land in `local/<app>/backend`, and `localFile.getBlob` streams them back.

- Object storage — `option.applyAdaptor(StorageAdaptorRole, S3Storage)` — For production and shared access. Write an `adapt()` class that implements `StorageAdaptor` and apply it in `lib/option.ts`.

Applying your own adaptor is one line in the app's option file:

**The service stays the same.** It only knows `plug(StorageAdaptorRole)`, so moving to S3, R2 or MinIO touches no upload code.

**Using `@libs/util`?** Its `ObjectStorageApi` already speaks S3, R2, MinIO and Naver. Set `objectStorage` in `env/env.server.<env>.ts`; `libs/shared`'s File service reads it through `use<StorageApi>()`.

Tips

**Keep the record and the bytes apart.** The database stores how to find the file, never the file itself.

**Put the File id in the storage path.** Two users can then upload files with the same name.

**Progress is optional at first.** It starts to matter for large files on object storage.

**Delete both when you delete.** A `_postRemove` that deletes the storage object keeps the File record and the stored bytes in step.

## Code Examples

### apps/myapp/lib/file/file.constant.ts

```ts
import { enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class FileStatus extends enumOf("fileStatus", ["uploading", "active"] as const) {}

export class FilePurpose extends enumOf("filePurpose", ["profile", "attachment"] as const) {}

export class FileInput extends via((field) => ({
  filename: field(String),
  mimetype: field(String),
  url: field(String, { default: "" }),
  size: field(Int, { default: 0 }),
})) {}

export class FileObject extends via(FileInput, (field) => ({
  status: field(FileStatus, { default: "uploading" }),
  progress: field(Int, { default: 0 }),
})) {}

export class LightFile extends via(
  FileObject,
  ["filename", "url", "size", "status"] as const,
  (resolve) => ({}),
) {}

export class File extends via(FileObject, LightFile, (resolve) => ({})) {}

export class FileInsight extends via(File, (field) => ({})) {}
```

### apps/myapp/lib/file/file.document.ts

```ts
import { by, from, into } from "akanjs/document";
import * as cnst from "../cnst";

export class FileFilter extends from(cnst.File, (filter) => ({
  query: {},
  sort: {},
})) {}

export class File extends by(cnst.File) {}

export class FileModel extends into(File, FileFilter, cnst.file, () => ({})) {
  async progressUpload(id: string, loaded: number | undefined, total: number) {
    const progress = Math.floor(((loaded ?? 0) / (total || 1)) * 100);
    await this.File.updateById(id, { progress });
  }
  async finishUpload(id: string, url: string) {
    await this.File.updateById(id, { url, progress: 100, status: "active" });
  }
}
```

### apps/myapp/lib/file/file.signal.ts

```ts
import { Admin, User } from "@libs/shared/srvkit";
import { Upload } from "akanjs/base";
import { endpoint, internal, None, slice } from "akanjs/signal";

import * as cnst from "../cnst";
import * as srv from "../srv";

export class FileInternal extends internal(srv.file, () => ({})) {}

export class FileSlice extends slice(
  srv.file,
  { guards: { root: Admin, get: User, cru: None } },
  () => ({}),
) {}

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  uploadFiles: mutation([cnst.File], { guards: [User] })
    .body("files", [Upload])
    .body("purpose", cnst.FilePurpose)
    .exec(async function (files, purpose) {
      return await this.fileService.uploadFiles(files, purpose);
    }),
})) {}
```

### apps/myapp/lib/file/file.service.ts

```ts
import { serve, StorageAdaptorRole } from "akanjs/service";

import * as db from "../db";

export class FileService extends serve(db.file, ({ plug }) => ({
  storage: plug(StorageAdaptorRole),
})) {
  async uploadFiles(files: File[], purpose: string) {
    return await Promise.all(files.map((file) => this.uploadFile(file, purpose)));
  }

  async uploadFile(file: File, purpose: string) {
    const record = await this.fileModel.createFile({
      filename: file.name,
      mimetype: file.type,
      size: file.size,
      url: "",
      status: "uploading",
      progress: 0,
    });

    this.storage.uploadDataFromStream({
      path: `${purpose}/${record.id}`,
      body: file.stream(),
      mimetype: file.type,
      updateProgress: async ({ loaded }) => {
        await this.fileModel.progressUpload(record.id, loaded, file.size);
      },
      uploadSuccess: async (url) => {
        await this.fileModel.finishUpload(record.id, url);
      },
    });

    return record;
  }
}
```

### apps/myapp/lib/file/file.store.ts

```ts
import { store } from "akanjs/store";

import type * as cnst from "../cnst";
import { fetch, sig } from "../useClient";

export class FileStore extends store(sig.file, () => ({
  // state
  uploadedFile: null as cnst.File | null,
})) {
  // action
  async uploadProfileFile(fileList: FileList | File[]) {
    if (!fileList.length) return;
    const [file] = await fetch.uploadFiles(fileList, "profile");
    this.set({ uploadedFile: file ?? null });
  }
  async refreshUploadedFile() {
    const { uploadedFile } = this.get();
    if (uploadedFile?.status !== "uploading") return;
    this.set({ uploadedFile: await fetch.file(uploadedFile.id) });
  }
}
```

### apps/myapp/lib/file/File.Util.tsx

```ts
"use client";
import { st, usePage } from "@apps/myapp/client";
import { resolveServerUrl } from "akanjs/client";
import { Image } from "akanjs/ui";
import { useInterval } from "akanjs/webkit";

export const Upload = () => {
  const { l } = usePage();
  const uploadedFile = st.use.uploadedFile();
  useInterval(st.do.refreshUploadedFile, 1000);
  return (
    <div className="flex flex-col gap-2">
      <input
        type="file"
        onChange={(e) => void st.do.uploadProfileFile(e.target.files ?? [])}
      />
      {uploadedFile?.status === "active" ? (
        <>
          {uploadedFile.mimetype.startsWith("image/") ? (
            <Image src={uploadedFile.url} alt={uploadedFile.filename} />
          ) : null}
          <a href={resolveServerUrl(uploadedFile.url)} download={uploadedFile.filename}>
            {l.trans({ en: "Download", ko: "다운로드" })}
          </a>
        </>
      ) : null}
    </div>
  );
};
```

### apps/myapp/lib/file/file.signal.ts

```ts
import { Every } from "@libs/shared/srvkit";
import { dayjs, ID, Upload } from "akanjs/base";

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  addFiles: mutation([cnst.File], { guards: [Every], fileUpload: true, mcp: false })
    .body("files", [Upload])
    .body("metas", String, {
      example: `[{"lastModifiedAt":"2024-01-14T15:32:47.766Z","size":0}]`,
    })
    .body("type", String, { example: "user" })
    .body("parentId", ID, { nullable: true })
    .exec(async function (files, metas, type, parentId) {
      const rawMetas = JSON.parse(metas) as { lastModifiedAt: string; size: number }[];
      const parsedMetas = rawMetas.map((meta) => ({
        ...meta,
        lastModifiedAt: dayjs(meta.lastModifiedAt),
      }));
      return await this.fileService.addFiles(files, parsedMetas, type, parentId);
    }),
})) {}
```

### apps/myapp/lib/user/user.constant.ts

```ts
import { via } from "akanjs/constant";
import { File } from "../file/file.constant";

export class UserInput extends via((field) => ({
  nickname: field(String, { default: "" }),
  image: field(File, { cascade: "removeRef" }).optional(),
  images: field([File], { cascade: "removeRef" }),
})) {}
```

### apps/myapp/lib/file/file.service.ts

```ts
export class FileService extends serve(db.file, ({ plug }) => ({
  storage: plug(StorageAdaptorRole),
})) {
  override async _postRemove(file: db.File) {
    await this.storage.deleteData(file.url);
    return file;
  }
}
```

### apps/myapp/lib/option.ts

```ts
import { AkanOption } from "akanjs/server";
import { StorageAdaptorRole } from "akanjs/service";
import { S3Storage } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  [key: string]: unknown;
};

export const option = new AkanOption<ModulesOptions>()
  .applyAdaptor(StorageAdaptorRole, S3Storage);
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

