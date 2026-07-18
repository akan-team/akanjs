# fileMeta Abstract
업로드 요청에서 파일 문서 생성에 필요한 클라이언트 메타데이터를 전달한다.

## Rules
- size와 lastModifiedAt은 업로드 파일과 같은 순서의 stream에 대응한다.
- fileId가 있으면 기존 ID로 파일 문서를 생성하거나 갱신할 수 있다.
