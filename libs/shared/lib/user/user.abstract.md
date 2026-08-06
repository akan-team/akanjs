# user Abstract
사용자 가입, 인증, 프로필 심사, 상태 전이를 관리한다.

## Rules
- active/dormant/restricted 계정의 accountId와 phone은 중복될 수 없다.
- prepare 사용자는 인증 단계가 끝난 뒤 active로 전환된다.
- password, phone code, SSO, refresh session은 cache와 security service로 검증한다.
- 제한, 휴면, 탈퇴, 활성화는 summary 집계와 함께 움직인다.
- 검색 색인에는 공개 프로필 필드(`nickname`, `playing`, `image`, `status`, `roles`)만 올린다.
  `name`/`accountId`/`phone`/`discord` 등 secret 필드는 색인 자체가 거부되며, 그래야 검색 결과로 새지 않는다.
- `bySearch`는 filter만 선언하고 slice로 노출하지 않는다. `UserSlice`의 `get`이 `Public`이라
  노출하는 순간 누구나 사용자 목록을 훑을 수 있게 되므로, 공개 여부는 마운트하는 앱이 정한다.

## Workflow
- prepare user 생성 후 nickname/profile/auth 정보를 채우고 activate한다.
- 로그인은 access token과 refresh token session을 발급한다.
- 관리자는 역할, 제한, 계정 정보, 프로필 상태를 조정할 수 있다.
