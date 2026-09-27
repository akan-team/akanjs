# notiInfo Abstract
사용자의 알림 선호도, 일시 중지 시각, 기기 토큰을 보관한다.

## Rules
- 알림 설정은 disagree, fewer, normal, block 중 하나다.
- 기본 알림 설정은 `normal`이다.
- device token은 사용자 단위로 추가/제거된다. 한 항목은 `deviceToken` 스칼라이고, provider 가 없는 옛 문자열 토큰은 읽을 때 버린다.
- **점 경로(`notiInfo.setting`)로 쓰지 않는다.** 이 스칼라가 아직 없는 행에서는 점 경로 쓰기가
  없는 JSON 객체로 들어가 아무것도 저장하지 않으면서, 검색 트리거 때문에 `modifiedCount` 는 1 이상을
  답한다. 그 조합이 등록한 기기 토큰이 조용히 사라지던 원인이다. 항상 객체 전체를 쓴다.
- 부모 필드(`user.notiInfo`)에 default 가 있어야 스칼라가 실체화된다. default 이전에 만들어진 행은
  아무것도 저장하지 않은 상태이고, 첫 쓰기가 객체를 만들어 준다.
