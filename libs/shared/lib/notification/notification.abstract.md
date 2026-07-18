# notification Abstract
Firebase 토픽/토큰 구독과 푸시 발송 기록을 관리한다.

## Rules
- 개인 알림 토픽은 `user-<userId>` 형식을 사용한다.
- 전체 알림은 `all_users` 토픽으로 발송한다.
- 푸시 발송 전 Notification 문서를 먼저 생성한다.
- 이미지가 있으면 file 서비스에서 URL을 조회해 payload에 포함한다.

## Workflow
- 사용자는 개인/전체 토픽을 구독하고, 관리자는 push notification을 발송한다.
