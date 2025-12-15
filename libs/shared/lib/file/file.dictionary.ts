import { modelDictionary } from "@akanjs/dictionary";

import type { File, FileInsight, FileStatus } from "./file.constant";
import type { FileFilter } from "./file.document";
import type { FileEndpoint, FileSlice } from "./file.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["File", "파일"]).desc([
      "File is a blob data that is stored in the database, such as image, document or video",
      "파일은 이미지, 문서, 비디오 등과 같이 데이터베이스에 저장되는 blob 데이터입니다.",
    ])
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
    byFilename: fn(["By Filename", "파일명별 조회"]).arg((t) => ({
      filename: t(["Filename", "파일명"]).desc(["Filename to search", "파일명으로 조회"]),
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
  }))
  .slice<FileSlice>((fn) => ({}))
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
    addFilesRestApi: fn(["Add Files (for RESTful API", "파일 추가 (RESTful API)"])
      .desc(["Add files to the database (for RESTful API)", "데이터베이스에 파일 추가 (RESTful API)"])
      .arg((t) => ({
        files: t(["File Streams", "파일 스트림"]).desc(["File streams to be uploaded", "업로드할 파일 스트림"]),
        metas: t(["File Metas", "파일 메타"]).desc(["File metas to be uploaded", "업로드할 파일 메타"]),
        type: t(["Parent Type", "상위 타입"]).desc([
          "Parent type of file in database",
          "데이터베이스에 저장될 파일의 상위 타입",
        ]),
        parentId: t(["Parent Id", "상위 Id"]).desc(["Parent id to be uploaded", "상위 Id"]),
      })),
    generatePdf: fn(["Export PDF", "PDF 내보내기"])
      .desc(["Export PDF to file", "PDF를 파일로 내보내기"])
      .arg((t) => ({
        url: t(["Url", "Url"]).desc(["Url to export", "내보낼 Url"]),
      })),
  }));
