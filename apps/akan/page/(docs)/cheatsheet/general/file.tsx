import { usePage } from "@apps/akan/client";
import { Code, Docs } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";

export default function Page() {
  const { l } = usePage();

  return (
    <Scroll>
      <Scroll.Slide id="what-you-build" title={l.trans({ en: "What You Build", ko: "무엇을 만들까" })}>
        <Docs.Title>{l.trans({ en: "What You Build", ko: "무엇을 만들까" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A minimal file feature has one simple idea: store the real file in storage, and store only the file record in the database.",
              ko: "최소 파일 기능의 핵심은 단순합니다. 실제 파일은 저장소에 두고, DB에는 파일을 찾기 위한 기록만 저장합니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "A File model saves filename, url, size, status, and progress.",
                ko: "File model은 파일명, URL, 크기, 상태, 진행률을 저장합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "An upload endpoint receives `Upload` from the client.",
                ko: "Upload endpoint는 client에서 `Upload`를 받습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "A service writes the file stream to storage and updates the File record.",
                ko: "Service는 file stream을 저장소에 쓰고 File record를 갱신합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "For local development, a small endpoint can serve files back as a stream.",
                ko: "로컬 개발에서는 작은 endpoint가 파일을 stream으로 다시 제공할 수 있습니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="minimal-model" title={l.trans({ en: "Minimal File Model", ko: "최소 File 모델" })}>
        <Docs.Title>{l.trans({ en: "Minimal File Model", ko: "최소 File 모델" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start with only the fields your UI needs. You can add image size, blur preview, origin URL, or other metadata later.",
              ko: "처음에는 UI에 필요한 field만 넣으세요. 이미지 크기, blur preview, 원본 URL 같은 metadata는 나중에 추가해도 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="file.constant.ts"
          code={`import { enumOf, Int } from "akanjs/base";
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
export class File extends via(FileObject, LightFile, (resolve) => ({})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="upload-endpoint" title={l.trans({ en: "Upload Endpoint", ko: "Upload Endpoint" })}>
        <Docs.Title>{l.trans({ en: "Upload Endpoint", ko: "Upload Endpoint" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The endpoint should stay boring. Receive files, choose a purpose folder, and delegate the real work to the service.",
              ko: "Endpoint는 단순하게 유지하세요. 파일을 받고, 어떤 용도의 폴더에 넣을지 정한 뒤, 실제 작업은 service에 맡깁니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="file.signal.ts"
          code={`import { Upload } from "akanjs/base";
import { endpoint } from "akanjs/signal";

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  uploadFiles: mutation([cnst.File])
    .body("files", [Upload])
    .body("purpose", String, { example: "profile" })
    .exec(async function (files, purpose) {
      return await this.fileService.uploadFiles(files, purpose);
    }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="file-service" title={l.trans({ en: "File Service", ko: "File Service" })}>
        <Docs.Title>{l.trans({ en: "File Service", ko: "File Service" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The service is the heart of the feature. It creates a File record first, uploads the real file, then saves the final URL back to the record.",
              ko: "Service가 파일 기능의 중심입니다. 먼저 File record를 만들고, 실제 파일을 업로드한 뒤, 최종 URL을 record에 다시 저장합니다.",
            })}
          </div>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              {l.trans({ en: "Create a record with `uploading` status.", ko: "`uploading` 상태의 record를 만듭니다." })}
            </li>
            <li>
              {l.trans({
                en: "Use the record id in the storage path to avoid filename collisions.",
                ko: "파일명 충돌을 피하려고 storage path에 record id를 사용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "When upload finishes, save the returned URL and set status to `active`.",
                ko: "업로드가 끝나면 반환된 URL을 저장하고 상태를 `active`로 바꿉니다.",
              })}
            </li>
          </ol>
        </Docs.Description>
        <Code.Snippet
          title="file.service.ts"
          code={`export class FileService extends serve(db.file, ({ use }) => ({
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

    const path = \`\${purpose}/\${record.id}-\${file.name}\`;

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
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="use-in-ui" title={l.trans({ en: "Use In UI", ko: "UI에서 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use In UI", ko: "UI에서 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "After upload, the UI usually uses the returned File record. For images, show `file.url`. For documents, use it as a download link.",
              ko: "업로드 후 UI는 보통 반환된 File record를 사용합니다. 이미지는 `file.url`을 보여주고, 문서는 다운로드 링크로 쓰면 됩니다.",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          title="Call fetch.uploadFiles"
          code={`const onChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
  const files = [...(event.target.files ?? [])];
  if (!files.length) return;
  const [file] = await fetch.uploadFiles(files, "profile");
  return file;
};`}
        />
        <Code.Snippet
          title="Preview or download"
          code={`const [file] = await fetch.uploadFiles([selectedFile], "profile");

return (
  <div>
    <img src={file.url} alt={file.filename} />
    <a href={file.url} download={file.filename}>
      Download
    </a>
  </div>
);`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="auto-field" title={l.trans({ en: "Auto-attach To A Model Field", ko: "모델 필드 자동 연결" })}>
        <Docs.Title>{l.trans({ en: "Auto-attach To A Model Field", ko: "모델 필드 자동 연결" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Mark one upload mutation with `{ fileUpload: true }`. The framework then auto-generates the `add{Model}Files` fetch helper and the form-field upload action (`add{Field}FilesOn{Model}`) that the `Field` and `Upload` components use, so a model's file field uploads and attaches automatically.",
              ko: "업로드 mutation 하나에 `{ fileUpload: true }`를 달면, 프레임워크가 `add{Model}Files` fetch 헬퍼와 폼 필드 업로드 액션(`add{Field}FilesOn{Model}`)을 자동 생성합니다. `Field`/`Upload` 컴포넌트가 이를 사용해 모델의 파일 field가 자동으로 업로드·연결됩니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Mark exactly one REST upload mutation; the marker rides the serialized signal to the client.",
                ko: "REST 업로드 mutation 딱 하나만 마킹하세요. 마커는 직렬화 시그널에 실려 클라이언트로 전달됩니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "The multipart form uses the fixed fields `files`, `metas`, `type`, `parentId`.",
                ko: "멀티파트 폼은 고정 필드 `files`, `metas`, `type`, `parentId`를 사용합니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title="file.signal.ts"
          code={`export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  addFiles: mutation([cnst.File], { fileUpload: true })
    .body("files", [Upload])
    .body("metas", String, { example: \`[{"lastModifiedAt":"2024-01-14T15:32:47.766Z","size":0}]\` })
    .body("type", String, { example: "user" })
    .body("parentId", ID, { nullable: true })
    .exec(async function (files, metas, type, parentId) {
      const parsedMetas = JSON.parse(metas).map((meta) => ({ ...meta, lastModifiedAt: dayjs(meta.lastModifiedAt) }));
      return await this.fileService.addFiles(files, parsedMetas, type, parentId);
    }),
})) {}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="cascade" title={l.trans({ en: "Remove The File With Its Owner", ko: "소유 모델과 함께 삭제" })}>
        <Docs.Title>{l.trans({ en: "Remove The File With Its Owner", ko: "소유 모델과 함께 삭제" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: 'Add `cascade: "remove"` to a File relation and removing the owner removes the file too. The cascade calls the File service, not the File model, so `FileService._postRemove` runs and the stored object is deleted from blob or object storage. Nothing else is needed — the storage call already lives in that hook.',
              ko: 'File 관계 필드에 `cascade: "remove"`를 달면 소유 모델을 지울 때 파일도 함께 지워집니다. 캐스케이드는 File 모델이 아니라 File 서비스를 호출하므로 `FileService._postRemove`가 실행되고, blob/object storage의 객체까지 삭제됩니다. 그 훅에 이미 스토리지 호출이 들어 있어서 따로 배선할 것이 없습니다.',
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Works on an array field too, and only on a relation. A String, an ID, or a scalar fails the class build: none of them names a document to remove.",
                ko: "배열 필드에도 동작하며, 관계 필드에만 붙일 수 있습니다. String·ID·scalar는 클래스 빌드에서 실패합니다. 셋 다 삭제할 문서를 가리키지 않기 때문입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Nothing checks whether another document still points at the same file. Files are deduped by origin, so declaring cascade asserts that this field owns its file exclusively.",
                ko: "다른 문서가 같은 파일을 아직 참조하는지는 검사하지 않습니다. 파일은 origin 기준으로 중복 제거되므로, cascade를 선언한다는 것은 이 필드가 그 파일을 단독으로 소유한다는 선언입니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "The document removal is soft, but deleting the stored object is not. A cascade cannot be undone.",
                ko: "문서 삭제는 soft remove지만 저장된 객체 삭제는 되돌릴 수 없습니다. 캐스케이드는 복구되지 않습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Query-level removal fires no hooks and therefore no cascade. removeManyByQuery stamps removedAt in one atomic update; remove documents one at a time when they cascade.",
                ko: "쿼리 단위 삭제는 훅을 태우지 않으므로 캐스케이드도 돌지 않습니다. removeManyByQuery는 removedAt을 원자적 업데이트 한 번으로 찍습니다. 캐스케이드가 걸린 모델은 문서 단위로 지우세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
        <Code.Snippet
          title="user.constant.ts"
          code={`export class UserInput extends via((field) => ({
  nickname: field(String, { default: "" }),
  image: field(File, { cascade: "remove" }).optional(),
  images: field([File], { cascade: "remove" }),
})) {}`}
        />
        <Code.Snippet
          title="file.service.ts — where the storage call already lives"
          code={`export class FileService extends serve(db.file, ({ use }) => ({ storageApi: use<StorageApi>() })) {
  override async _postRemove(file: db.File) {
    await this.storageApi.deleteData(file.url);
    return file;
  }
}`}
        />
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="grow-later" title={l.trans({ en: "Grow Later", ko: "나중에 확장하기" })}>
        <Docs.Title>{l.trans({ en: "Grow Later", ko: "나중에 확장하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start with local storage. When the feature works, move to S3, R2, MinIO, or another storage by changing the storage adapter, not every upload API.",
              ko: "처음에는 local storage로 시작하세요. 기능이 잘 동작하면 모든 업로드 API를 고치지 말고 storage adapter만 바꿔 S3, R2, MinIO 같은 저장소로 옮기면 됩니다.",
            })}
          </div>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Local: easy to debug and good for development.",
                ko: "Local: 디버깅하기 쉽고 개발에 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Cloud: better for production and shared access.",
                ko: "Cloud: 운영 환경과 공유 접근에 좋습니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Same service: keep upload logic behind `storageApi`.",
                ko: "Same service: 업로드 로직은 `storageApi` 뒤에 숨겨둡니다.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <div className="divider" />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "꿀팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "꿀팁" })}</Docs.Title>
        <Docs.Description>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {l.trans({
                en: "Keep the database record and the real file separate. The DB stores how to find the file.",
                ko: "DB record와 실제 파일은 분리하세요. DB는 파일을 찾는 방법을 저장합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Use the File id in the storage path so two users can upload files with the same name.",
                ko: "서로 같은 이름의 파일을 올려도 충돌하지 않도록 storage path에 File id를 사용하세요.",
              })}
            </li>
            <li>
              {l.trans({
                en: "Progress is optional at first, but very helpful for large files.",
                ko: "progress는 처음엔 선택 사항이지만, 큰 파일에서는 매우 유용합니다.",
              })}
            </li>
            <li>
              {l.trans({
                en: "When deleting a file, remove both the File record and the storage object.",
                ko: "파일을 삭제할 때는 File record와 storage object를 함께 정리하세요.",
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Scroll.TitleNavigator className="fixed top-32 right-0 hidden w-[250px] flex-col gap-2 lg:flex" />
    </Scroll>
  );
}
