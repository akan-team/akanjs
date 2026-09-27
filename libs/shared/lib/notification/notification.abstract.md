# notification Abstract
푸시 발송과 그 기록을 관리한다.

## Rules
- 토픽에 토큰을 구독시키는 엔드포인트는 두지 않는다: 가드 없이 아무 토큰이나 전체 토픽에 넣을 수 있었다.
- 푸시 발송 전 Notification 문서를 먼저 생성한다.
- 이미지가 있으면 file 서비스에서 URL을 조회해 payload에 포함한다.

## Workflow
- 관리자는 push notification을 발송한다.
