import { usePage } from "@apps/akan/client";
import { Code, cardGridRecipe, Divider, Docs, DocsToc, panelRecipe } from "@apps/akan/ui";
import { Scroll } from "@libs/util/ui";
import { page } from "akanjs/client";

export default page().render(() => {
  const { l } = usePage();

  const bulletList = "my-4 list-disc space-y-2 pl-5";
  const chip = "mt-2 block overflow-x-auto whitespace-nowrap rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-xs";

  const pieceRows = [
    {
      name: ["file.constant.ts", "file.document.ts"],
      desc: l.trans({
        en: (
          <>
            <strong>File model.</strong> Stores the File record with its name, url, size, status and progress.
          </>
        ),
        ko: (
          <>
            <strong>File 모델.</strong> 이름, url, 크기, 상태, 진행률을 담은 File 레코드를 저장합니다.
          </>
        ),
      }),
    },
    {
      name: "file.signal.ts",
      desc: l.trans({
        en: (
          <>
            <strong>Upload endpoint.</strong> Receives <code>Upload</code> files and hands them to the service.
          </>
        ),
        ko: (
          <>
            <strong>업로드 엔드포인트.</strong> 클라이언트가 보낸 <code>Upload</code> 파일을 받아 서비스에 넘깁니다.
          </>
        ),
      }),
    },
    {
      name: "file.service.ts",
      desc: l.trans({
        en: (
          <>
            <strong>File service.</strong> Creates the record, streams the bytes to storage, and saves the URL.
          </>
        ),
        ko: (
          <>
            <strong>File 서비스.</strong> 레코드를 만들고, 바이트를 스토리지로 보내고, 최종 URL을 저장합니다.
          </>
        ),
      }),
    },
    {
      name: "StorageAdaptorRole",
      desc: l.trans({
        en: (
          <>
            <strong>Storage adaptor.</strong> Where the bytes live; the default <code>BlobStorage</code> writes to local
            disk.
          </>
        ),
        ko: (
          <>
            <strong>스토리지 어댑터.</strong> 바이트가 실제로 놓이는 곳으로, 기본값인 <code>BlobStorage</code>는 로컬
            디스크에 씁니다.
          </>
        ),
      }),
    },
    {
      name: ["file.store.ts", "File.Util.tsx"],
      desc: l.trans({
        en: (
          <>
            <strong>Store and UI.</strong> Upload from a file input and show the result once it is <code>active</code>.
          </>
        ),
        ko: (
          <>
            <strong>스토어와 UI.</strong> 파일 입력으로 업로드하고, <code>active</code>가 되면 결과를 보여 줍니다.
          </>
        ),
      }),
    },
    {
      name: "localFile.getBlob",
      desc: l.trans({
        en: (
          <>
            <strong>Serve endpoint.</strong> Ships in <code>@libs/util</code> and streams a local file back during
            development.
          </>
        ),
        ko: (
          <>
            <strong>파일 제공 엔드포인트.</strong> <code>@libs/util</code>에 들어 있으며, 개발 중에 로컬 파일을
            스트림으로 돌려줍니다.
          </>
        ),
      }),
    },
  ];

  const fieldRows = [
    {
      name: "filename",
      desc: l.trans({
        en: "The name the user picked, handed back as the download name.",
        ko: "사용자가 고른 파일 이름으로, 내려받을 때 이 이름을 돌려줍니다.",
      }),
    },
    {
      name: "mimetype",
      desc: l.trans({
        en: "The browser's type for the file, such as `image/png`.",
        ko: "브라우저가 알려 준 파일 타입입니다(예: `image/png`).",
      }),
    },
    {
      name: "url",
      desc: l.trans({
        en: "Where storage serves the bytes, empty until the upload finishes.",
        ko: "스토리지가 바이트를 내주는 주소로, 업로드가 끝날 때까지는 비어 있습니다.",
      }),
    },
    {
      name: "size",
      desc: l.trans({ en: "The file size in bytes.", ko: "바이트 단위 파일 크기입니다." }),
    },
    {
      name: "status",
      desc: l.trans({
        en: "`uploading` while the bytes move, `active` once storage answers with a URL.",
        ko: "바이트가 옮겨지는 동안은 `uploading`, 스토리지가 URL을 돌려주면 `active`입니다.",
      }),
    },
    {
      name: "progress",
      desc: l.trans({ en: "Upload progress from 0 to 100.", ko: "0부터 100까지의 업로드 진행률입니다." }),
    },
    {
      name: "FilePurpose",
      desc: l.trans({
        en: "Not a field but an enum: the folder a file goes to, since it becomes part of the storage path.",
        ko: "필드가 아닌 enum으로, 파일이 들어갈 폴더이자 스토리지 경로의 일부입니다.",
      }),
    },
  ];

  const documentNotes = [
    l.trans({
      en: (
        <>
          <strong>
            <code>updateById</code> is one direct write.
          </strong>{" "}
          It fires no hooks, which is fine for a progress tick.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>updateById</code>는 한 번의 직접 쓰기입니다.
          </strong>{" "}
          훅은 타지 않지만 진행률 갱신에는 충분합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>finishUpload</code> is the <code>uploading → active</code> step.
          </strong>{" "}
          It saves the URL and sets <code>progress</code> to 100 in the same write.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>finishUpload</code>가 <code>uploading → active</code> 전환입니다.
          </strong>{" "}
          URL 저장과 <code>progress</code> 100 설정을 한 번에 씁니다.
        </>
      ),
    }),
  ];

  const endpointNotes = [
    l.trans({
      en: (
        <>
          <strong>
            An <code>Upload</code> argument makes the request multipart form data.
          </strong>{" "}
          <code>fetch.uploadFiles</code> accepts a <code>FileList</code> or <code>File[]</code> and builds the form for
          you.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>Upload</code> 인자가 있으면 요청이 multipart 폼 데이터가 됩니다.
          </strong>{" "}
          <code>fetch.uploadFiles</code>는 <code>FileList</code>나 <code>File[]</code>를 받아 폼을 알아서 만듭니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>purpose</code> is an enum, so the server rejects any other value.
          </strong>{" "}
          It becomes a folder name, and a free-form string would let the caller pick the folder.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>purpose</code>는 enum이라 다른 값은 서버가 거절합니다.
          </strong>{" "}
          폴더 이름이 되는 값이라, 자유 문자열이면 호출자가 폴더를 고를 수 있게 됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>get: User</code> gives the UI <code>fetch.file(id)</code>.
          </strong>{" "}
          The UI uses it to re-read a record while it uploads.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>get: User</code>가 있어야 UI에 <code>fetch.file(id)</code>가 생깁니다.
          </strong>{" "}
          업로드 중인 레코드를 UI가 다시 읽을 때 씁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Agents never see this endpoint.</strong> An endpoint that takes <code>Upload</code> is not published
          over MCP.
        </>
      ),
      ko: (
        <>
          <strong>에이전트에게는 보이지 않습니다.</strong> <code>Upload</code>를 받는 엔드포인트는 MCP에 공개되지
          않습니다.
        </>
      ),
    }),
  ];

  const serviceSteps = [
    l.trans({
      en: (
        <>
          Create the record with status <code>uploading</code>.
        </>
      ),
      ko: (
        <>
          <code>uploading</code> 상태로 레코드를 만듭니다.
        </>
      ),
    }),
    l.trans({
      en: "Use the record id in the storage path, so filenames never collide.",
      ko: "파일 이름이 겹치지 않도록 스토리지 경로에 레코드 id를 씁니다.",
    }),
    l.trans({
      en: (
        <>
          When the upload finishes, save the returned URL and set the status to <code>active</code>.
        </>
      ),
      ko: (
        <>
          업로드가 끝나면 돌아온 URL을 저장하고 상태를 <code>active</code>로 바꿉니다.
        </>
      ),
    }),
  ];

  const serviceNotes = [
    l.trans({
      en: (
        <>
          <strong>The upload is not awaited.</strong> <code>uploadFile</code> returns the <code>uploading</code> record
          at once, and the two callbacks fill in progress and the URL later.
        </>
      ),
      ko: (
        <>
          <strong>업로드를 기다리지 않습니다.</strong> <code>uploadFile</code>은 <code>uploading</code> 레코드를 바로
          돌려주고, 진행률과 URL은 두 콜백이 나중에 채웁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            The path is <code>{"<purpose>/<record id>"}</code>.
          </strong>{" "}
          Two users can upload <code>photo.png</code> without a collision, and the filename the client sent never
          reaches a disk path.
        </>
      ),
      ko: (
        <>
          <strong>
            경로는 <code>{"<purpose>/<record id>"}</code>입니다.
          </strong>{" "}
          두 사용자가 같은 <code>photo.png</code>를 올려도 겹치지 않고, 클라이언트가 보낸 파일 이름은 디스크 경로에
          들어가지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>BlobStorage</code> reports no progress.
          </strong>{" "}
          It calls <code>uploadSuccess</code> once the write ends, so on local disk <code>progress</code> jumps from 0
          to 100.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>BlobStorage</code>는 진행률을 보고하지 않습니다.
          </strong>{" "}
          쓰기가 끝나면 <code>uploadSuccess</code>만 부르므로, 로컬 디스크에서는 <code>progress</code>가 0에서 바로
          100이 됩니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>plug(StorageAdaptorRole)</code> names a role, not a vendor.
          </strong>{" "}
          Swapping storage later leaves this file untouched.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>plug(StorageAdaptorRole)</code>은 벤더가 아니라 역할을 가리킵니다.
          </strong>{" "}
          나중에 스토리지를 바꿔도 이 파일은 그대로입니다.
        </>
      ),
    }),
  ];

  const uiNotes = [
    l.trans({
      en: (
        <>
          <strong>
            Components call <code>st.do</code>, never <code>fetch</code>.
          </strong>{" "}
          The store action owns the request and writes the result into state.
        </>
      ),
      ko: (
        <>
          <strong>
            컴포넌트는 <code>fetch</code>가 아니라 <code>st.do</code>를 부릅니다.
          </strong>{" "}
          요청은 스토어 액션이 맡고, 결과를 state에 씁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            <code>useInterval</code> only polls while the file uploads.
          </strong>{" "}
          <code>refreshUploadedFile</code> returns at once for an <code>active</code> file.
        </>
      ),
      ko: (
        <>
          <strong>
            <code>useInterval</code>은 업로드 중일 때만 실제로 다시 읽습니다.
          </strong>{" "}
          <code>active</code>인 파일이면 <code>refreshUploadedFile</code>이 바로 돌아옵니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            Images show <code>url</code>; every file can be downloaded from it.
          </strong>{" "}
          <code>download={"{filename}"}</code> restores the name the user picked, since the stored path holds only the
          id.
        </>
      ),
      ko: (
        <>
          <strong>
            이미지는 <code>url</code>을 보여 주고, 모든 파일은 그 주소로 내려받습니다.
          </strong>{" "}
          저장 경로에는 id만 있으므로 <code>download={"{filename}"}</code>로 사용자가 고른 이름을 돌려줍니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>
            A link goes through <code>resolveServerUrl</code>.
          </strong>{" "}
          The stored <code>url</code> is relative to the server, and a page a native shell or a desktop app serves is on
          another origin. <code>Image</code> already resolves it.
        </>
      ),
      ko: (
        <>
          <strong>
            링크는 <code>resolveServerUrl</code>을 거칩니다.
          </strong>{" "}
          저장된 <code>url</code>은 서버 기준 상대 경로이고, 네이티브 셸이나 데스크톱 앱이 띄운 페이지는 origin이
          다릅니다. <code>Image</code>는 이미 이렇게 풀어 씁니다.
        </>
      ),
    }),
  ];

  const generatedRows = [
    {
      name: "fetch.add<Model>Files",
      desc: l.trans({
        en: "Takes `(fileList, parentId?)` and posts the files, with `type` set to the model's name.",
        ko: "`(fileList, parentId?)`를 받아 표시한 mutation으로 파일을 보냅니다. `type`에는 모델 이름이 들어갑니다.",
      }),
    },
    {
      name: "st.do.upload<Field>On<Model>",
      desc: l.trans({
        en: "Takes `(fileList, index?)`, fills a File field of the form, and re-reads it every 3 s.",
        ko: "`(fileList, index?)`를 받아 폼의 File 필드를 채우고, 3초마다 다시 읽습니다.",
      }),
    },
    {
      name: ["Field.Img", "Field.Imgs", "Field.File", "Field.Files"],
      desc: l.trans({
        en: "Form controls in `@libs/shared/ui` that call `add<Model>Files` for the `slice` you pass.",
        ko: "`@libs/shared/ui`의 폼 컨트롤입니다. 넘긴 `slice`의 `add<Model>Files`를 부릅니다.",
      }),
    },
  ];

  const multipartRows = [
    {
      key: "files",
      type: "[Upload]",
      desc: l.trans({ en: "The files, in the order they were picked.", ko: "고른 순서대로 담긴 파일들입니다." }),
    },
    {
      key: "metas",
      type: "String",
      desc: l.trans({
        en: "A JSON array with one `{ lastModifiedAt, size }` per file.",
        ko: "파일마다 `{ lastModifiedAt, size }` 하나씩 담은 JSON 배열입니다.",
      }),
    },
    {
      key: "type",
      type: "String",
      desc: l.trans({
        en: "The owning model's name, such as `user`.",
        ko: "파일을 가질 모델의 이름입니다(예: `user`).",
      }),
    },
    {
      key: "parentId",
      type: "ID",
      tags: ["nullable"],
      desc: l.trans({
        en: "The id of the form being edited, left out when there is none.",
        ko: "편집 중인 폼의 id입니다. 없으면 보내지 않습니다.",
      }),
    },
  ];

  const autoNotes = [
    l.trans({
      en: (
        <>
          <strong>Mark exactly one mutation.</strong> If two carry the flag, the first one found is used and a warning
          is printed.
        </>
      ),
      ko: (
        <>
          <strong>딱 하나만 표시합니다.</strong> 두 개에 붙어 있으면 먼저 찾은 쪽을 쓰고 경고를 출력합니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Put it in the File module's own signal.</strong> The store action appears only on fields typed as the
          model whose signal holds the flag.
        </>
      ),
      ko: (
        <>
          <strong>File 모듈의 시그널에 둡니다.</strong> 스토어 액션은 플래그를 가진 시그널의 모델 타입인 필드에만
          생깁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Guard it like any mutation.</strong> <code>Every</code> admits users and admins, since admin forms
          such as a banner editor upload too.
        </>
      ),
      ko: (
        <>
          <strong>다른 mutation처럼 가드를 겁니다.</strong> 배너 편집 같은 관리자 폼도 업로드하므로, 사용자와 관리자를
          모두 통과시키는 <code>Every</code>를 씁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>No flag, no helpers.</strong> Without it, <code>add&lt;Model&gt;Files</code> throws "File upload is
          not configured".
        </>
      ),
      ko: (
        <>
          <strong>플래그가 없으면 헬퍼도 동작하지 않습니다.</strong> 이때 <code>add&lt;Model&gt;Files</code>는 "File
          upload is not configured" 오류를 던집니다.
        </>
      ),
    }),
  ];

  const cascadeNotes = [
    l.trans({
      en: (
        <>
          <strong>Arrays work too, but only on a relation.</strong> A plain string id or an embedded scalar has no
          document to remove.
        </>
      ),
      ko: (
        <>
          <strong>배열 필드에도 되지만, 관계 필드에만 붙습니다.</strong> 문자열 id나 내장 스칼라에는 지울 문서가
          없습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Nothing checks for other owners.</strong> <code>libs/shared</code>'s File dedupes by{" "}
          <code>origin</code>, so two documents can share one file; <code>removeRef</code> declares that this field owns
          it alone.
        </>
      ),
      ko: (
        <>
          <strong>다른 소유자가 있는지는 검사하지 않습니다.</strong> <code>libs/shared</code>의 File은{" "}
          <code>origin</code> 기준으로 중복을 없애므로 두 문서가 한 파일을 함께 쓸 수 있습니다. <code>removeRef</code>는
          이 필드가 파일을 단독으로 소유한다는 선언입니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Query-level removes skip the cascade.</strong> <code>removeMany</code>, <code>removeById</code> and
          the generated <code>remove&lt;Filter&gt;</code> stamp <code>removedAt</code> in one atomic update and fire no
          hooks. Remove cascading documents one at a time.
        </>
      ),
      ko: (
        <>
          <strong>쿼리 단위 삭제는 캐스케이드를 건너뜁니다.</strong> <code>removeMany</code>, <code>removeById</code>,
          생성된 <code>remove&lt;Filter&gt;</code>는 <code>removedAt</code>을 원자적 업데이트 한 번으로 찍고 훅을 타지
          않습니다. 캐스케이드가 걸린 문서는 하나씩 지우세요.
        </>
      ),
    }),
  ];

  const storageCards = [
    {
      title: l.trans({ en: "Local disk", ko: "로컬 디스크" }),
      code: "BlobStorage",
      desc: l.trans({
        en: (
          <>
            The default and the easiest to debug. Files land in <code>{"local/<app>/backend"}</code>, and{" "}
            <code>localFile.getBlob</code> streams them back.
          </>
        ),
        ko: (
          <>
            기본값이고 디버깅이 가장 쉽습니다. 파일은 <code>{"local/<app>/backend"}</code>에 쌓이고,{" "}
            <code>localFile.getBlob</code>이 스트림으로 돌려줍니다.
          </>
        ),
      }),
    },
    {
      title: l.trans({ en: "Object storage", ko: "오브젝트 스토리지" }),
      code: "option.applyAdaptor(StorageAdaptorRole, S3Storage)",
      desc: l.trans({
        en: (
          <>
            For production and shared access. Write an <code>adapt()</code> class that implements{" "}
            <code>StorageAdaptor</code> and apply it in <code>lib/option.ts</code>.
          </>
        ),
        ko: (
          <>
            운영 환경과 여러 서버의 공유 접근에 맞습니다. <code>StorageAdaptor</code>를 구현한 <code>adapt()</code>{" "}
            클래스를 만들어 <code>lib/option.ts</code>에 적용합니다.
          </>
        ),
      }),
    },
  ];

  const tipNotes = [
    l.trans({
      en: (
        <>
          <strong>Keep the record and the bytes apart.</strong> The database stores how to find the file, never the file
          itself.
        </>
      ),
      ko: (
        <>
          <strong>레코드와 바이트를 분리하세요.</strong> DB에는 파일을 찾는 방법만 저장하고, 파일 자체는 넣지 않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Put the File id in the storage path.</strong> Two users can then upload files with the same name.
        </>
      ),
      ko: (
        <>
          <strong>스토리지 경로에 File id를 넣으세요.</strong> 그래야 두 사용자가 같은 이름의 파일을 올려도 충돌하지
          않습니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Progress is optional at first.</strong> It starts to matter for large files on object storage.
        </>
      ),
      ko: (
        <>
          <strong>진행률은 처음엔 선택 사항입니다.</strong> 오브젝트 스토리지에 큰 파일을 올릴 때부터 쓸모가 생깁니다.
        </>
      ),
    }),
    l.trans({
      en: (
        <>
          <strong>Delete both when you delete.</strong> A <code>_postRemove</code> that deletes the storage object keeps
          the File record and the stored bytes in step.
        </>
      ),
      ko: (
        <>
          <strong>지울 때는 둘 다 지우세요.</strong> 스토리지 객체를 지우는 <code>_postRemove</code>를 두면 File
          레코드와 저장된 바이트가 함께 정리됩니다.
        </>
      ),
    }),
  ];

  return (
    <Scroll>
      <Scroll.Slide id="what-you-build" title={l.trans({ en: "What You Build", ko: "무엇을 만드나요" })}>
        <Docs.Title>{l.trans({ en: "What You Build", ko: "무엇을 만드나요" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "A file feature splits one upload in two. The bytes go to storage, and the database keeps a File record that says where they are.",
              ko: "파일 기능은 업로드 하나를 둘로 나눕니다. 바이트는 스토리지로 가고, DB에는 그 위치를 알려 주는 File 레코드만 남깁니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Where", ko: "위치" })} items={pieceRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  Every File starts as <code>uploading</code> and becomes <code>active</code> when storage returns its
                  URL. The sections below build the pieces in this order.
                </span>
              ),
              ko: (
                <span>
                  모든 File은 <code>uploading</code>으로 시작해, 스토리지가 URL을 돌려주면 <code>active</code>가 됩니다.
                  아래 섹션에서 이 순서대로 하나씩 만듭니다.
                </span>
              ),
            })}
          </div>
          <ul className={bulletList}>
            <li>
              {l.trans({
                en: (
                  <>
                    <strong>
                      Already have <code>libs/shared</code>?
                    </strong>{" "}
                    Its File module (<code>libs/shared/lib/file</code>) is the full version of this recipe, with image
                    size, blur preview, dedupe by origin, and the <code>Field.Img</code> / <code>Field.File</code>{" "}
                    controls.
                  </>
                ),
                ko: (
                  <>
                    <strong>
                      <code>libs/shared</code>가 이미 있나요?
                    </strong>{" "}
                    그 File 모듈(<code>libs/shared/lib/file</code>)이 이 레시피의 완성판입니다. 이미지 크기, blur
                    미리보기, origin 기준 중복 제거, <code>Field.Img</code> / <code>Field.File</code> 컨트롤까지 들어
                    있습니다.
                  </>
                ),
              })}
            </li>
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="minimal-model" title={l.trans({ en: "Minimal File Model", ko: "최소 File 모델" })}>
        <Docs.Title>{l.trans({ en: "Minimal File Model", ko: "최소 File 모델" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start with only the fields your UI needs. Image size, a blur preview or the origin URL can come later.",
              ko: "처음에는 UI에 필요한 필드만 넣으세요. 이미지 크기, blur 미리보기, 원본 URL은 나중에 더해도 됩니다.",
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "Field", ko: "필드" })} items={fieldRows} />
          <div>
            {l.trans({
              en: "The constant file declares them, with the five classes every model has:",
              ko: "constant 파일에서 모든 모델이 갖는 다섯 클래스로 선언합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/file/file.constant.ts"
          code={`import { enumOf, Int } from "akanjs/base";
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

export class FileInsight extends via(File, (field) => ({})) {}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: "The service needs two writes on the model, one per progress tick and one when storage answers:",
              ko: "서비스에는 모델 쓰기 두 가지가 필요합니다. 진행률이 바뀔 때 한 번, 스토리지가 답할 때 한 번입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/file/file.document.ts"
          code={`import { by, from, into } from "akanjs/document";
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
}`}
        />
        <ul className={bulletList}>
          {documentNotes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="upload-endpoint" title={l.trans({ en: "Upload Endpoint", ko: "업로드 엔드포인트" })}>
        <Docs.Title>{l.trans({ en: "Upload Endpoint", ko: "업로드 엔드포인트" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Keep the endpoint boring. It takes the files and a purpose, and hands the real work to the service:",
              ko: "엔드포인트는 단순하게 둡니다. 파일과 용도를 받아서, 실제 작업은 서비스에 넘깁니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/file/file.signal.ts"
          code={`import { Admin, User } from "@libs/shared/srvkit";
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
})) {}`}
        />
        <ul className={bulletList}>
          {endpointNotes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="file-service" title={l.trans({ en: "File Service", ko: "File 서비스" })}>
        <Docs.Title>{l.trans({ en: "File Service", ko: "File 서비스" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "The service is the heart of the feature. For each file it does three things:",
              ko: "서비스가 파일 기능의 중심입니다. 파일마다 세 가지를 합니다:",
            })}
          </div>
          <ol className="my-4 list-decimal space-y-2 pl-5">
            {serviceSteps.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/file/file.service.ts"
          code={`import { serve, StorageAdaptorRole } from "akanjs/service";

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
      path: \`\${purpose}/\${record.id}\`,
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
}`}
        />
        <ul className={bulletList}>
          {serviceNotes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="use-in-ui" title={l.trans({ en: "Use In UI", ko: "UI에서 사용하기" })}>
        <Docs.Title>{l.trans({ en: "Use In UI", ko: "UI에서 사용하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The endpoint answers before storage finishes writing, so the record comes back as{" "}
                  <code>uploading</code> with an empty <code>url</code>. Keep it in the store, re-read it until it is{" "}
                  <code>active</code>, then show the <code>url</code>.
                </span>
              ),
              ko: (
                <span>
                  엔드포인트는 스토리지 쓰기가 끝나기 전에 답하므로, 레코드는 <code>uploading</code> 상태에 빈{" "}
                  <code>url</code>로 돌아옵니다. 스토어에 담아 두고 <code>active</code>가 될 때까지 다시 읽은 뒤{" "}
                  <code>url</code>을 보여 줍니다.
                </span>
              ),
            })}
          </div>
          <Docs.SubSubTitle>
            {l.trans({ en: "1. Upload and re-read in the store", ko: "1. 스토어에서 올리고 다시 읽기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "One action uploads and keeps the record; the other refreshes it while it uploads:",
              ko: "액션 하나는 업로드하고 레코드를 담아 두고, 다른 하나는 업로드 중인 레코드를 새로 읽습니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/file/file.store.ts"
          code={`import { store } from "akanjs/store";

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
}`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>
            {l.trans({ en: "2. Show it in a component", ko: "2. 컴포넌트에서 보여 주기" })}
          </Docs.SubSubTitle>
          <div>
            {l.trans({
              en: "An image shows as a preview, and every file gets a download link:",
              ko: "이미지는 미리보기로 보여 주고, 모든 파일에 다운로드 링크를 붙입니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/file/File.Util.tsx"
          code={`"use client";
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
};`}
        />
        <ul className={bulletList}>
          {uiNotes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide
        id="auto-field"
        title={l.trans({ en: "Auto-attach To A Model Field", ko: "모델 필드에 자동 연결" })}
      >
        <Docs.Title>{l.trans({ en: "Auto-attach To A Model Field", ko: "모델 필드에 자동 연결" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Writing that for every model gets repetitive. Mark one upload mutation with{" "}
                  <code>{"{ fileUpload: true }"}</code>, and every model gets helpers that upload into its File fields:
                </span>
              ),
              ko: (
                <span>
                  모델마다 이런 코드를 쓰면 같은 일이 반복됩니다. 업로드 mutation 하나에{" "}
                  <code>{"{ fileUpload: true }"}</code>를 달면, 모든 모델이 자기 File 필드로 업로드하는 헬퍼를 얻습니다:
                </span>
              ),
            })}
          </div>
          <Docs.IntroTable type={l.trans({ en: "You get", ko: "생기는 것" })} items={generatedRows} />
          <div>
            {l.trans({
              en: (
                <span>
                  The marked mutation takes four fixed body fields in this shape. For the service method it calls, see{" "}
                  <code>FileService.addFiles</code> in <code>libs/shared/lib/file</code>:
                </span>
              ),
              ko: (
                <span>
                  표시한 mutation은 고정된 body 필드 네 개를 이 모양으로 받습니다. 여기서 부르는 서비스 메서드는{" "}
                  <code>libs/shared/lib/file</code>의 <code>FileService.addFiles</code>를 참고하세요:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/file/file.signal.ts"
          code={`import { Every } from "@libs/shared/srvkit";
import { dayjs, ID, Upload } from "akanjs/base";

export class FileEndpoint extends endpoint(srv.file, ({ mutation }) => ({
  addFiles: mutation([cnst.File], { guards: [Every], fileUpload: true, mcp: false })
    .body("files", [Upload])
    .body("metas", String, {
      example: \`[{"lastModifiedAt":"2024-01-14T15:32:47.766Z","size":0}]\`,
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
})) {}`}
        />
        <Docs.Description>
          <Docs.SubSubTitle>{l.trans({ en: "The four fields", ko: "네 가지 필드" })}</Docs.SubSubTitle>
          <Docs.OptionTable items={multipartRows} />
          <ul className={bulletList}>
            {autoNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="cascade" title={l.trans({ en: "Remove The File With Its Owner", ko: "소유 모델과 함께 삭제" })}>
        <Docs.Title>{l.trans({ en: "Remove The File With Its Owner", ko: "소유 모델과 함께 삭제" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  Add <code>{'cascade: "removeRef"'}</code> to a File relation, and removing the owner removes its files
                  too. Mark the relation on the owner:
                </span>
              ),
              ko: (
                <span>
                  File 관계 필드에 <code>{'cascade: "removeRef"'}</code>를 달면, 소유 모델을 지울 때 파일도 함께
                  지워집니다. 소유 모델의 관계 필드에 표시합니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/user/user.constant.ts"
          code={`import { via } from "akanjs/constant";
import { File } from "../file/file.constant";

export class UserInput extends via((field) => ({
  nickname: field(String, { default: "" }),
  image: field(File, { cascade: "removeRef" }).optional(),
  images: field([File], { cascade: "removeRef" }),
})) {}`}
        />
        <Docs.Description>
          <div>
            {l.trans({
              en: (
                <span>
                  The cascade calls the File service, not the File model, so <code>FileService._postRemove</code> runs.
                  Put the storage delete there and there is nothing else to wire:
                </span>
              ),
              ko: (
                <span>
                  캐스케이드는 File 모델이 아니라 File 서비스를 부르므로 <code>FileService._postRemove</code>가
                  실행됩니다. 스토리지 삭제를 거기에 두면 따로 연결할 것이 없습니다:
                </span>
              ),
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/file/file.service.ts"
          code={`export class FileService extends serve(db.file, ({ plug }) => ({
  storage: plug(StorageAdaptorRole),
})) {
  override async _postRemove(file: db.File) {
    await this.storage.deleteData(file.url);
    return file;
  }
}`}
        />
        <ul className={bulletList}>
          {cascadeNotes.map((note, idx) => (
            <li key={idx}>{note}</li>
          ))}
        </ul>
        <Docs.Alert type="warning">
          {l.trans({
            en: (
              <span>
                <strong>A cascade cannot be undone.</strong> The document removal is soft (<code>removedAt</code>), but
                the storage delete is not, and restoring the owner does not bring its files back.
              </span>
            ),
            ko: (
              <span>
                <strong>캐스케이드는 되돌릴 수 없습니다.</strong> 문서 삭제는 soft remove(<code>removedAt</code>)지만
                스토리지 삭제는 아니며, 소유 모델을 복구해도 파일은 돌아오지 않습니다.
              </span>
            ),
          })}
        </Docs.Alert>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="grow-later" title={l.trans({ en: "Grow Later", ko: "나중에 확장하기" })}>
        <Docs.Title>{l.trans({ en: "Grow Later", ko: "나중에 확장하기" })}</Docs.Title>
        <Docs.Description>
          <div>
            {l.trans({
              en: "Start on local disk. Once the feature works, move to S3, R2 or MinIO by swapping the storage adaptor, not by rewriting the upload API.",
              ko: "처음에는 로컬 디스크로 시작하세요. 기능이 동작하면 업로드 API를 고치지 말고 스토리지 어댑터만 바꿔 S3, R2, MinIO로 옮깁니다.",
            })}
          </div>
          <div className={cardGridRecipe({ cols: "mdTwo" }, "my-4")}>
            {storageCards.map((card) => (
              <div key={card.code} className={panelRecipe({ radius: "lg", padding: "sm" }, "min-w-0")}>
                <div className="font-semibold text-primary">{card.title}</div>
                <code className={chip}>{card.code}</code>
                <div className="mt-2 text-foreground/70 text-sm">{card.desc}</div>
              </div>
            ))}
          </div>
          <div>
            {l.trans({
              en: "Applying your own adaptor is one line in the app's option file:",
              ko: "직접 만든 어댑터는 앱의 option 파일에서 한 줄로 적용합니다:",
            })}
          </div>
        </Docs.Description>
        <Code.Snippet
          className="w-full"
          title="apps/myapp/lib/option.ts"
          code={`import { AkanOption } from "akanjs/server";
import { StorageAdaptorRole } from "akanjs/service";
import { S3Storage } from "../srvkit";
import type { LibOptions } from "./srv";

export type ModulesOptions = LibOptions & {
  [key: string]: unknown;
};

export const option = new AkanOption<ModulesOptions>()
  .applyAdaptor(StorageAdaptorRole, S3Storage);`}
        />
        <ul className={bulletList}>
          <li>
            {l.trans({
              en: (
                <>
                  <strong>The service stays the same.</strong> It only knows <code>plug(StorageAdaptorRole)</code>, so
                  moving to S3, R2 or MinIO touches no upload code.
                </>
              ),
              ko: (
                <>
                  <strong>서비스는 그대로입니다.</strong> 서비스는 <code>plug(StorageAdaptorRole)</code>이라는 역할만
                  알기 때문에, S3, R2, MinIO로 옮겨도 업로드 코드는 건드리지 않습니다.
                </>
              ),
            })}
          </li>
          <li>
            {l.trans({
              en: (
                <>
                  <strong>
                    Using <code>@libs/util</code>?
                  </strong>{" "}
                  Its <code>ObjectStorageApi</code> already speaks S3, R2, MinIO and Naver. Set{" "}
                  <code>objectStorage</code> in <code>{"env/env.server.<env>.ts"}</code>; <code>libs/shared</code>'s
                  File service reads it through <code>{"use<StorageApi>()"}</code>.
                </>
              ),
              ko: (
                <>
                  <strong>
                    <code>@libs/util</code>을 쓰나요?
                  </strong>{" "}
                  그 안의 <code>ObjectStorageApi</code>가 이미 S3, R2, MinIO, Naver를 지원합니다.{" "}
                  <code>{"env/env.server.<env>.ts"}</code>에 <code>objectStorage</code>를 설정하면,{" "}
                  <code>libs/shared</code>의 File 서비스가 <code>{"use<StorageApi>()"}</code>로 읽어 씁니다.
                </>
              ),
            })}
          </li>
        </ul>
      </Scroll.Slide>
      <Divider />

      <Scroll.Slide id="tips" title={l.trans({ en: "Tips", ko: "팁" })}>
        <Docs.Title>{l.trans({ en: "Tips", ko: "팁" })}</Docs.Title>
        <Docs.Description>
          <ul className={bulletList}>
            {tipNotes.map((note, idx) => (
              <li key={idx}>{note}</li>
            ))}
          </ul>
        </Docs.Description>
      </Scroll.Slide>
      <DocsToc />
    </Scroll>
  );
});
