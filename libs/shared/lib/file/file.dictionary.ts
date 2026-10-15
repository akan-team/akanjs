import { modelDictionary } from "akanjs/dictionary";

import type { File, FileInsight, FileStatus } from "./file.constant";
import type { FileFilter } from "./file.document";
import type { FileEndpoint, FileSlice } from "./file.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["File", "파일"]).desc([
      "File is a blob data that is stored in the database, such as image, document or video",
      "파일은 이미지, 문서, 비디오 등과 같이 데이터베이스에 저장되는 blob 데이터입니다.",
    ]),
  )
  .model<File>((t) => ({
    imageSize: t(["Image Size", "이미지사이즈"]).desc([
      "Size of the image as width and height tuple in pixel",
      "이미지의 가로세로 픽셀 사이즈",
    ]),
    filename: t(["File Name", "파일명"]).desc(["Name of the file with extension", "확장자를 포함한 파일명"]),
    origin: t(["Origin", "원본"]).desc(["Origin source url of the file", "파일의 원본 소스 url"]),
    mimetype: t(["Mime Type", "파일타입"]).desc(["Mime type of the file", "파일의 Mime 타입"]),
    encoding: t(["Encoding", "인코딩"]).desc(["Encoding of the file", "파일의 인코딩"]),
    url: t(["Url", "Url"]).desc(["Url of the file", "파일의 Url"]),
    progress: t(["Progress", "진행률"]).desc([
      "Upload progress of the file, uploading status files are used only",
      "파일의 업로드 진행률, 업로드중인 파일만 사용됩니다",
    ]),
    lastModifiedAt: t(["Last Modified At", "마지막 수정일"]).desc([
      "Last modified date of the file",
      "파일의 마지막 수정일",
    ]),
    size: t(["Size", "용량"]).desc(["File size in bytes", "파일의 바이트 단위 용량"]),
    abstractData: t(["Abstract Data", "요약 데이터"]).desc([
      "Abstract blurred encoded data of image files to preview",
      "미리보기를 위한 이미지 파일의 추상화된 블러 처리된 인코딩 데이터",
    ]),
    status: t(["Status", "상태"]).desc(["Status of the file", "파일의 상태"]),
  }))
  .insight<FileInsight>((t) => ({}))
  .query<FileFilter>((fn) => ({
    byIds: fn(["By Ids", "Id별 조회"]).arg((t) => ({
      ids: t(["Ids", "Id"]).desc(["Ids to search", "Id로 조회"]),
    })),
    byOrigin: fn(["By Origin", "원본별 조회"]).arg((t) => ({
      origin: t(["Origin", "원본"]).desc(["Origin to search", "원본으로 조회"]),
    })),
  }))
  .enum<FileStatus>("fileStatus", (t) => ({
    active: t(["Active", "활성"]).desc([
      "File is successfully uploaded and created with normally accessible",
      "파일 업로드가 완료되어 정상적으로 생성되었으며 접근 가능합니다",
    ]),
    uploading: t(["Uploading", "업로드중"]).desc([
      "File is being uploaded, but not yet created",
      "파일이 업로드중이며 아직 생성되지 않았습니다",
    ]),
    failed: t(["Failed", "실패"]).desc([
      "The upload stopped before it finished; upload the file again",
      "업로드가 끝나기 전에 멈췄습니다. 파일을 다시 올려야 합니다",
    ]),
  }))
  .slice<FileSlice>((fn) => ({
    inIds: fn(["In Ids", "Id별 조회"])
      .desc(["Files in ids", "Id에 해당하는 파일"])
      .arg((t) => ({
        ids: t(["Ids", "Id"]).desc(["Ids to search", "Id로 조회"]),
      })),
  }))
  .endpoint<FileEndpoint>((fn) => ({
    addFiles: fn(["Add Files", "파일 추가"])
      .desc(["Add files to the database", "데이터베이스에 파일 추가"])
      .arg((t) => ({
        files: t(["File Streams", "파일 스트림"]).desc(["File streams to be uploaded", "업로드할 파일 스트림"]),
        metas: t(["File Metas", "파일 메타"]).desc(["File metas to be uploaded", "업로드할 파일 메타"]),
        type: t(["Parent Type", "상위 타입"]).desc([
          "Parent type of file in database",
          "데이터베이스에 저장될 파일의 상위 타입",
        ]),
        parentId: t(["Parent Id", "상위 Id"]).desc(["Parent id to be uploaded", "상위 Id"]),
      })),
    requestFileUpload: fn(["Request File Upload", "파일 업로드 요청"])
      .desc([
        "Issue a one-time ticket for uploading local files from a shell. POST multipart/form-data to `uploadUrl` with the `ticket` field and one `files` part per file, e.g. `curl -F ticket=<ticket> -F files=@./a.png -F files=@./b.jpg <uploadUrl>`, within 10 minutes. The response lists the files as `uploading`; read `file` by id until its status is `active`, then pass the id to the model field that holds it.",
        "셸에서 로컬 파일을 올릴 1회용 티켓을 발급한다. 10분 안에 `uploadUrl`로 `ticket` 필드와 파일마다 `files` 파트를 담은 multipart/form-data를 POST한다. 예: `curl -F ticket=<ticket> -F files=@./a.png -F files=@./b.jpg <uploadUrl>`. 응답의 파일은 `uploading` 상태이므로 `file`을 id로 조회해 `active`가 된 뒤 그 id를 파일을 담을 모델 필드에 넘긴다.",
      ])
      .arg((t) => ({
        type: t(["Parent Type", "상위 타입"]).desc([
          "Model the files are for, such as banner; names the storage directory",
          "파일이 쓰일 모델(예: banner). 저장 디렉터리 이름이 된다",
        ]),
        parentId: t(["Parent Id", "상위 Id"]).desc([
          "Document the files are for, when it already exists",
          "파일이 쓰일 문서가 이미 있으면 그 id",
        ]),
      })),
    addFilesByTicket: fn(["Add Files By Ticket", "티켓으로 파일 추가"])
      .desc([
        "Upload files with a ticket from requestFileUpload instead of a session",
        "세션 대신 requestFileUpload에서 받은 티켓으로 파일을 올린다",
      ])
      .arg((t) => ({
        files: t(["File Streams", "파일 스트림"]).desc(["File streams to be uploaded", "업로드할 파일 스트림"]),
        ticket: t(["Ticket", "티켓"]).desc([
          "One-time ticket issued by requestFileUpload",
          "requestFileUpload가 발급한 1회용 티켓",
        ]),
      })),
  }))
  .error({
    invalidUploadTicket: [
      "The upload ticket is invalid, expired or already used; request a new one",
      "업로드 티켓이 올바르지 않거나 만료되었거나 이미 사용되었습니다. 새로 요청해야 합니다",
    ],
    fileStreamsAndMetasMismatch: [
      "File streams and file metas are not matched",
      "파일 스트림과 파일 메타의 수가 일치하지 않습니다",
    ],
    fileReadFailed: ["Failed to read the file data of {filename}", "{filename} 파일 데이터를 읽지 못했습니다"],
  })
  .translate({
    maxFilesExceeded: ["Up to {max} files can be attached here.", "여기에는 파일을 {max}개까지 올릴 수 있습니다."],
  });
