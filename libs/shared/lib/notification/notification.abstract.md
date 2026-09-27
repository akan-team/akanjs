# notification Abstract
사용자별 푸시 발송과 관리자 작성 알림 기록을 관리한다.

## Rules
- 발송 대상은 `user.notiInfo.deviceTokens` 다. `user-<userId>` 토픽은 쓰지 않는다 — 수신 설정을
  서버에서 평가해야 하고, 죽은 토큰을 잘라내야 하며, 토픽은 둘 다 못 한다.
- `all_users` 토픽은 전체 확성기 전용으로 남는다.
- 수신 여부는 `NotificationService.accepts` 한 곳에서만 판정한다: `block`/`disagree` 는 전부 차단,
  `fewer` 는 `actionRequired`/`essential` 만, `pauseUntil` 이 미래면 차단, 토큰이 없으면 제외.
- FCM 이 `registration-token-not-registered` 로 답한 토큰은 그 자리에서 사용자에게서 지운다.
  이게 없으면 재설치·사이트 데이터 삭제로 죽은 토큰이 영구히 쌓인다.
- `push()` 는 Notification 문서를 만들지 않는다. 채팅 한 건마다 수신자 수만큼 행을 쓰는 일을 피하고,
  안 읽은 것은 이미 `channelMember.unreadNum` 이 들고 있다. 문서 생성은 관리자 작성분
  (`sendPushNotification`)에만 남는다.
- 공용 라이브러리는 한국어 문구를 들 수 없으므로 `contentKey` 로 자기 모듈 딕셔너리를 가리킨다.
  해석 로케일은 앱의 `defaultLocale` 이다 — 사용자별 로케일 필드는 아직 없다.
- 알림 기록은 자기가 발송된 토큰/토픽을 담고 그 필드는 secret 이 아니다. 그래서 슬라이스 `get` 은
  `Admin` 이다.
- 기기 토큰을 다루는 엔드포인트는 MCP 에 오르지 않는다 — MCP 호출자에게는 기기가 없다.

## Workflow
- 브라우저가 권한을 받고 토큰을 등록한다 -> 도메인 이벤트가 `push()` 를 부른다 -> 수신 게이트를
  통과한 기기에 발송하고 죽은 토큰을 정리한다.
