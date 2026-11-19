# deviceToken Abstract
기기 하나의 푸시 수신 주소(토큰과 발송 경로)를 담고, `notiInfo.deviceTokens` 가 사용자별로 이것을 모은다.

## Rules
- `provider` 가 발송기를 고른다: `apns` 는 서버가 APNs 로 직접, `fcm` 은 firebase-admin 으로 보낸다. iOS 앱은 `apns`, Android 앱과 브라우저는 `fcm` 이다.
- 한 사용자 안에서 같은 `token` 이나 같은 `deviceId` 는 한 항목뿐이다. 다시 등록하면 앞의 것을 바꾼다.
- `updatedAt` 과 `sessionId` 는 서버가 등록할 때 쓴다. 클라이언트가 보낸 값은 쓰지 않는다. `sessionId` 는 등록한 요청의 로그인 세션이고, 그 세션을 원격으로 로그아웃하면 토큰도 지운다. 이 필드가 생기기 전에 등록된 토큰에는 없다.
