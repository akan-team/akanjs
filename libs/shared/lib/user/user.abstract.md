# user Abstract
사용자 가입, 인증, 프로필 심사, 상태 전이를 관리한다.

## Rules
- active/dormant/restricted 계정의 accountId와 phone은 중복될 수 없다.
- prepare 사용자는 인증 단계가 끝난 뒤 active로 전환된다.
- password, phone code, SSO, refresh session은 cache와 security service로 검증한다.
- 제한, 휴면, 탈퇴, 활성화는 summary 집계와 함께 움직인다.

## Workflow
- prepare user 생성 후 nickname/profile/auth 정보를 채우고 activate한다.
- 로그인은 access token과 refresh token session을 발급한다.
- 관리자는 역할, 제한, 계정 정보, 프로필 상태를 조정할 수 있다.
