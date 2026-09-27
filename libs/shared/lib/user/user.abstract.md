# user Abstract
사용자 가입, 인증, 프로필 심사, 상태 전이를 관리한다.

## Rules
- active/dormant/restricted 계정의 accountId와 phone은 중복될 수 없다.
- prepare 사용자는 인증 단계가 끝난 뒤 active로 전환된다.
- password, phone code, SSO, refresh session은 cache와 security service로 검증한다.
- 제한, 휴면, 탈퇴, 활성화는 summary 집계와 함께 움직인다.
- refresh token은 한 번만 쓰인다: 회전된 토큰을 다시 내밀면 계정의 모든 세션이 끊긴다(브라우저 세션). 한 토큰을 여러
  프로세스가 쥐는 호출자(클라우드 CLI)만 `refreshUserToken`에 `{ graceMs, reuseRevokes: "lineage" }`를 넘겨, 창 안의
  재사용은 새 세션으로 받고 창 밖의 재사용은 그 토큰의 lineage만 끊는다.
- CSR 클라이언트(네이티브 셸)는 API와 오리진이 달라 HttpOnly refresh 쿠키를 받지도 보내지도 못한다. 로그인·refresh 응답
  본문의 refresh token을 user·admin 범위별로 OS 자격 증명 저장소(`secretStorage`)에 두고 refresh 본문으로 보내며, 같은
  범위의 refresh는 한 번에 하나만 보낸다. 재설치한 앱은 첫 실행에서 그 저장소를 비우므로 이전 설치의 로그인을 이어받지 않는다.

## Workflow
- prepare user 생성 후 nickname/profile/auth 정보를 채우고 activate한다.
- 로그인은 access token과 refresh token session을 발급한다.
- 관리자는 역할, 제한, 계정 정보, 프로필 상태를 조정할 수 있다.
