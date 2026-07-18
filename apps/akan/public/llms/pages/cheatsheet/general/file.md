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
- Local File Serving (#local-serving)
- Use In UI (#use-in-ui)
- Auto-attach To A Model Field (#auto-field)
- Grow Later (#grow-later)
- Tips (#tips)

## Content

File Management

What You Build

A minimal file feature has one simple idea: store the real file in storage, and store only the file record in the database.

A File model saves filename, url, size, status, and progress.

An upload endpoint receives `Upload` from the client.

A service writes the file stream to storage and updates the File record.

For local development, a small endpoint can serve files back as a stream.

Minimal File Model

Start with only the fields your UI needs. You can add image size, blur preview, origin URL, or other metadata later.

Upload Endpoint

The endpoint should stay boring. Receive files, choose a purpose folder, and delegate the real work to the service.

File Service

The service is the heart of the feature. It creates a File record first, uploads the real file, then saves the final URL back to the record.

Create a record with `uploading` status.

Use the record id in the storage path to avoid filename collisions.

When upload finishes, save the returned URL and set status to `active`.

Local File Serving

If your local storage returns URLs like `/api/localFile/getBlob/...`, add a tiny endpoint that reads the file stream and returns it as a response.

Use In UI

After upload, the UI usually uses the returned File record. For images, show `file.url`. For documents, use it as a download link.

Auto-attach To A Model Field

Mark one upload mutation with `{ fileUpload: true }`. The framework then auto-generates the `add{Model}Files` fetch helper and the form-field upload action (`add{Field}FilesOn{Model}`) that the `Field` and `Upload` components use, so a model's file field uploads and attaches automatically.

Mark exactly one REST upload mutation; the marker rides the serialized signal to the client.

The multipart form uses the fixed fields `files`, `metas`, `type`, `parentId`.

Grow Later

Start with local storage. When the feature works, move to S3, R2, MinIO, or another storage by changing the storage adapter, not every upload API.

Local: easy to debug and good for development.

Cloud: better for production and shared access.

Same service: keep upload logic behind `storageApi`.

Tips

Keep the database record and the real file separate. The DB stores how to find the file.

Use the File id in the storage path so two users can upload files with the same name.

Progress is optional at first, but very helpful for large files.

When deleting a file, remove both the File record and the storage object.

## Code Examples

### file.constant.ts

```ts
import { enumOf, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class FileStatus extends enumOf("fileStatus", ["uploading", "active"] as const) {}

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

export class LightFile extends via(FileObject, ["filename", "url", "size", "status"] as const, (resolve) => ({})) {}
export class File extends via(FileObject, LightFile, (resolve) => ({})) {}
```

### file.signal.ts

```ts
import { Upload } from "akanjs/base";
import { endpoint } from "akanjs/signal";

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  uploadFiles: mutation([cnst.File])
    .body("files", [Upload])
    .body("purpose", String, { example: "profile" })
    .exec(async function (files, purpose) {
      return await this.fileService.uploadFiles(files, purpose);
    }),
})) {}
```

### file.service.ts

```ts
export class FileService extends serve(db.file, ({ use }) => ({
  storageApi: use<StorageApi>(),
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

    const path = `${purpose}/${record.id}-${file.name}`;

    this.storageApi.uploadDataFromStream({
      path,
      body: file.stream(),
      mimetype: file.type,
      updateProgress: async ({ loaded }) => {
        await this.fileModel.progressUpload(record.id, loaded, file.size);
      },
      uploadSuccess: async (url) => {
        await this.fileModel.finishUpload(record.id, url, {});
      },
    });

    return record;
  }
}
```

### localFile.signal.ts

```ts
export class LocalFileEndpoint extends endpoint(srv.localFile, ({ query }) => ({
  getBlob: query(Any, { path: "localFile/getBlob/*" })
    .with(Req)
    .exec(async function (req) {
      const path = req.url.split("/localFile/getBlob/").at(1) ?? "";
      const stream = await this.localFileService.readLocalFile(path);
      return new Response(stream);
    }),
})) {}
```

### Call fetch.uploadFiles

```ts
const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = [...(event.target.files ?? [])];
  if (!files.length) return;
  const [file] = await fetch.uploadFiles(files, "profile");
  return file;
};
```

### Preview or download

```ts
const [file] = await fetch.uploadFiles([selectedFile], "profile");

return (
  <div>
    <img src={file.url} alt={file.filename} />
    <a href={file.url} download={file.filename}>
      Download
    </a>
  </div>
);
```

### file.signal.ts

```ts
export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  addFiles: mutation([cnst.File], { fileUpload: true })
    .body("files", [Upload])
    .body("metas", String, { example: `[{"lastModifiedAt":"2024-01-14T15:32:47.766Z","size":0}]` })
    .body("type", String, { example: "user" })
    .body("parentId", ID, { nullable: true })
    .exec(async function (files, metas, type, parentId) {
      const parsedMetas = JSON.parse(metas).map((meta) => ({ ...meta, lastModifiedAt: dayjs(meta.lastModifiedAt) }));
      return await this.fileService.addFiles(files, parsedMetas, type, parentId);
    }),
})) {}
```

## Agent Notes

- Prefer the linked source docs for human-facing UI details and this Markdown mirror for agent context.
- Use this page as a task recipe, then verify with the relevant lint, test, or build command.

