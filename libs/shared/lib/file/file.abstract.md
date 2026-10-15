# file Abstract
공개 파일 업로드, 원격 수집, 저장소 업로드 상태를 추적한다.

## Rules
- 파일은 업로드 중 상태로 생성되고 저장소 업로드 완료 후 active가 된다. 15분간 진행이 없는 업로드는 failed가 된다 —
  업로드를 받던 인스턴스가 사라졌다는 뜻이고, 다른 인스턴스는 이어받을 수 없다.
- stream/metas 개수는 항상 일치해야 한다.
- 같은 origin 파일은 중복 생성하지 않고 기존 active 파일을 재사용한다.
- 파일 삭제 시 저장소의 공개 데이터도 함께 삭제한다.
- 업로드(addFiles)는 로그인한 계정(Every)만 할 수 있다.
- 세션 없는 업로드(셸에서 일하는 에이전트)는 로그인한 계정이 `requestFileUpload`로 받은 티켓으로만 한다(`addFilesByTicket`).
  티켓은 10분 뒤 만료되고 첫 업로드에 소모된다. 서버는 티켓의 해시와 발급 때 정한 저장 디렉터리만 기억하므로, 저장 위치는
  업로드 요청이 아니라 티켓이 정한다.
- 업로드의 크기는 받은 stream에서 읽는다. 클라이언트가 보낸 size와 mimetype은 믿지 않는다.
- 저장하는 Content-Type은 image/*(SVG 제외), video/*, application/pdf만 그대로 두고 나머지는 `application/octet-stream`으로
  바꾼다. object storage는 저장된 타입 그대로 서빙하므로 HTML이나 SVG가 스크립트로 실행될 수 있기 때문이다. 확장자도 그 타입에
  맞춰 다시 만든다.
- 저장소 경로의 purpose와 group은 영숫자·`_`·`-`만 남긴다.
- 원격 수집이나 JSON 조회가 실패하면 로그에는 URI의 origin과 쿼리를 뺀 원인만 남긴다. presigned 토큰이 로그에 남지 않게 한다.
- 원격 URI는 `UntrustedFetch`로만 가져온다: http/https만, 사설·루프백 주소 거부, 크기와 시간 상한.

## Workflow
- 업로드 진행률을 갱신하고 성공 시 URL, 이미지 요약, 크기 정보를 확정한다.
- uploading -> active | failed
