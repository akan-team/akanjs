import { modelDictionary } from "akanjs/dictionary";

import type { FileStatus } from "../file/file.constant";
import type { PrivFile, PrivFileInsight } from "./privFile.constant";
import type { PrivFileFilter } from "./privFile.document";
import type { PrivFileEndpoint, PrivFileSlice } from "./privFile.signal";

export const dictionary = modelDictionary(["en", "ko"])
  .of((t) =>
    t(["Private File", "비공개 파일"]).desc([
      "Private file is a server-only blob that is stored outside public asset serving.",
      "비공개 파일은 public asset 서빙 경로 밖에 저장되는 서버 전용 blob 데이터입니다.",
    ]),
  )
  .model<PrivFile>((t) => ({
    alias: t(["Alias", "별칭"]).desc(["Display alias for the private file", "비공개 파일 표시용 별칭"]),
    filename: t(["File Name", "파일명"]).desc(["Name of the file with extension", "확장자를 포함한 파일명"]),
    mimetype: t(["Mime Type", "파일타입"]).desc(["Mime type of the private file", "비공개 파일의 Mime 타입"]),
    encoding: t(["Encoding", "인코딩"]).desc(["Encoding of the private file", "비공개 파일의 인코딩"]),
    size: t(["Size", "용량"]).desc(["Private file size in bytes", "비공개 파일의 바이트 단위 용량"]),
    privatePath: t(["Private Path", "비공개 경로"]).desc([
      "Private path of the private file",
      "비공개 파일의 비공개 경로",
    ]),
    lastModifiedAt: t(["Last Modified At", "마지막 수정일"]).desc([
      "Last modified date of the private file",
      "비공개 파일의 마지막 수정일",
    ]),
    progress: t(["Progress", "진행률"]).desc([
      "Upload progress of the private file, uploading status files are used only",
      "비공개 파일의 업로드 진행률, 업로드중인 파일만 사용됩니다",
    ]),
    status: t(["Status", "상태"]).desc(["Status of the private file", "비공개 파일 상태"]),
  }))
  .insight<PrivFileInsight>((t) => ({}))
  .query<PrivFileFilter>((fn) => ({
    byAlias: fn(["By Alias", "별칭별 조회"]).arg((t) => ({
      alias: t(["Alias", "별칭"]).desc(["Alias to search", "조회할 별칭"]),
    })),
  }))
  .enum<FileStatus>("fileStatus", (t) => ({
    active: t(["Active", "활성"]).desc([
      "Private file is successfully uploaded and created",
      "비공개 파일 업로드가 완료되어 정상적으로 생성되었습니다",
    ]),
    uploading: t(["Uploading", "업로드중"]).desc([
      "Private file is being uploaded, but not yet created",
      "비공개 파일이 업로드중이며 아직 생성되지 않았습니다",
    ]),
  }))
  .slice<PrivFileSlice>((fn) => ({}))
  .endpoint<PrivFileEndpoint>((fn) => ({}))
  .error({
    privateFilePathEmpty: ["Private file path is empty", "비공개 파일 경로가 비어 있습니다"],
  });
