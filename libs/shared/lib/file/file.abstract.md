# file Abstract
공개 파일 업로드, 원격 수집, 저장소 업로드 상태를 추적한다.

## Rules
- 파일은 업로드 중 상태로 생성되고 저장소 업로드 완료 후 active가 된다. 15분간 진행이 없는 업로드는 failed가 된다 —
  업로드를 받던 인스턴스가 사라졌다는 뜻이고, 다른 인스턴스는 이어받을 수 없다.
- stream/metas 개수는 항상 일치해야 한다.
- 한 번의 업로드(addFiles)가 만드는 행은 한 트랜잭션에서 함께 만들어지고, 저장소 스트림은 커밋 뒤에야 시작된다. 행 하나라도
  실패하면 아무 스트림도 시작하지 않는다.
- 같은 origin 파일은 중복 생성하지 않고 기존 active 파일을 재사용한다.
- 파일 삭제 시 저장소의 공개 데이터도 함께 삭제한다.
- 업로드(addFiles)는 로그인한 계정(Every)만 할 수 있다.
- 사용자 세션의 업로드(addFiles, 사용자가 받은 티켓의 addFilesByTicket)는 올린 사용자를 `uploader`에 남기고, 응답에는 내보내지
  않는다. 관리자·서버 쪽 복사·이 규칙 이전의 파일은 비어 있다. 사용자가 자기 `image`/`images`에 새 파일을 걸 때 이 값으로 본인
  업로드인지 확인한다(`isUploadedBy`).
- id 로 읽는 `file`/`lightFile` 도 로그인한 계정만, 여러 id 를 한 번에 읽는 `fileListInIds` 는 관리자만 쓴다. 문서 id 는
  시각·프로세스·카운터로 추측할 수 있고 읽기는 주인을 확인하지 않아서, 열어 두면 아무나 후보 id 를 쓸어 다른 조직의 파일 url 을
  모을 수 있었다. 공개 페이지가 보여 주는 파일(로고·아바타·발행 문서 첨부)은 그 페이지의 레코드가 관계로 풀어 주므로 이
  가드를 거치지 않는다.
- 저장소 경로의 파일 이름은 `<id>-<무작위 토큰>` 이다. 버킷은 키를 아는 누구에게나 내주므로 id 만으로 url 을 만들 수 없게 한다.
  이 규칙 이전에 올린 파일의 url 은 여전히 id 로 만들어진다. 같은 id 로 다시 복사하면(`addFileFromLocal`의 `fileId`) 새 키에
  올린 뒤 이전 url 의 객체를 지운다. 지우기 실패는 로그만 남긴다.
- 세션 없는 업로드(셸에서 일하는 에이전트)는 로그인한 계정이 `requestFileUpload`로 받은 티켓으로만 한다(`addFilesByTicket`).
  티켓은 10분 뒤 만료되고 첫 업로드에 소모된다. 서버는 티켓의 해시와 발급 때 정한 저장 디렉터리만 기억하므로, 저장 위치는
  업로드 요청이 아니라 티켓이 정한다.
- 업로드의 크기는 받은 stream에서 읽는다. 클라이언트가 보낸 size와 mimetype은 믿지 않는다.
- 업로드(addFiles, addFilesByTicket)는 파일 하나당 `FileService.maxUploadBytes`(100MB)까지 받는다. 하나라도 넘으면 행을
  만들기 전에 배치 전체를 `file.error.fileTooLarge`(413)로 거부한다. 요청 본문 자체는 Bun의 `maxRequestBodySize`가 막는다.
- 저장하는 Content-Type은 image/*(SVG 제외), video/*, audio/*, application/pdf만 그대로 두고 나머지는 `application/octet-stream`으로
  바꾼다. object storage는 저장된 타입 그대로 서빙하므로 HTML이나 SVG가 스크립트로 실행될 수 있기 때문이다. 확장자도 그 타입에
  맞춰 다시 만든다. 서버 안에서 들어오는 파일(`addFileFromLocal`, 원격 수집 포함)도 같은 규칙으로 행의 mimetype과 확장자를 정한다.
- 저장소 경로의 purpose와 group은 영숫자·`_`·`-`만 남긴다.
- 원격 수집이나 JSON 조회가 실패하면 로그에는 URI의 origin과 쿼리를 뺀 원인만 남긴다. presigned 토큰이 로그에 남지 않게 한다.
- 원격 URI는 `UntrustedFetch`로만 가져온다: http/https만, 사설·루프백 주소 거부, 크기와 시간 상한.

## Workflow
- 업로드 진행률을 갱신하고 성공 시 URL, 이미지 요약, 크기 정보를 확정한다.
- uploading -> active | failed
