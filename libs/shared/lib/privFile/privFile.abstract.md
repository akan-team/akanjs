# privFile Abstract
외부 공개 URL 없이 private storage 경로로만 접근하는 파일을 관리한다.

## Rules
- private file은 `private/<purpose>/<group>/<id>` 경로에 저장한다. purpose와 group은 영숫자·`_`·`-`만 남기므로 경로가 그 밖으로 나가지 않는다.
- privatePath는 행을 만들 때 정한다. 업로드가 실패하면 행을 지우고(저장소 객체도 함께) 원래 오류를 다시 던진다. 업로드 URL을 발급할 수 없는 저장소에서는 행을 만들지 않는다.
- 하루가 지나도 uploading인 행은 매시간 지운다. 올리던 인스턴스가 사라졌거나 presigned URL이 쓰이지 않고 만료된 것이다.
- privatePath가 없으면 읽기와 저장을 허용하지 않는다.
- 문서 삭제 시 private storage 데이터도 함께 삭제한다.
- stream 업로드도 local file 업로드와 동일하게 privatePath를 확정하고 완료 후 size와 active 상태를 기록한다.
- 업로드 대상(`createUploadTarget`)은 privatePath를 먼저 정하고 그 경로에만 PUT할 수 있는 presigned URL을 준다. 올리는 쪽은
  저장소 자격증명을 갖지 않는다. `finishUploadTarget`이 저장소에서 객체 크기를 확인한 뒤에야 active가 된다. 크기는 목록 조회로
  읽는다 — R2는 압축 가능한 타입의 HEAD에 Content-Length를 주지 않는다.

## Workflow
- 로컬 파일을 private storage에 올린 뒤 active 상태와 privatePath를 확정한다.
- 서버가 받은 stream을 public URL 없이 private storage에 올리고, 이후 서버 서비스만 privatePath로 읽는다.
