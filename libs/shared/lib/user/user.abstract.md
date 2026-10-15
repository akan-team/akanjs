# user Abstract
사용자 가입, 인증, 프로필 심사, 상태 전이를 관리한다.

## Rules
- active/dormant/restricted 계정의 accountId와 phone은 중복될 수 없다.
- prepare 사용자의 id만으로는 아무것도 할 수 없다. 모든 가입 단계와 활성화는 그 draft에 묶인 signup token(`typ: "signup"`,
  24시간)을 함께 내야 하고, `generatePrepareUser`는 살아 있는 draft만 토큰으로 이어 준다. 관리자 활성화
  (`activateUserByAdmin`)는 가입 정책을 건너뛰고 세션을 발급하지 않는다.
- 활성화에는 신원을 증명한 verify가 하나 이상 있어야 한다(기본: password를 뺀 전부). `signup.activateVerifies: []`만이
  인증 없는 가입을 허용한다.
- 모든 로그인 경로(비밀번호, 휴대폰, SSO, refresh)는 같은 관문을 지난다. restricted는 제한이 끝날 때까지 막히고, 끝난 제한은
  로그인 시점과 10분 주기 cron에서 풀린다. dormant는 로그인할 수 있다. 제한은 그 계정의 세션을 끊는다.
- 상태 전이(가입, 활성화, 제한·해제, 휴면·복귀, 삭제)는 실제로 상태가 바뀔 때만 summary 카운터를 옮긴다.
- 휴대폰 인증번호는 계정·용도마다 하나만 살아 있고, 틀린 횟수는 하루 10회로 묶인다. 번호마다 하루 10통까지 보낸다.
  서명 토큰은 해시로만 저장하고 한 번 쓰면 사라지며, 로그인용과 비밀번호용이 서로 대신하지 못한다. 휴대폰 로그인은 userId를
  드러내지 않는다.
- 비밀번호 로그인은 15분에 10번 틀리면 잠기고, 없는 계정과 틀린 비밀번호를 같은 오류로 답한다.
- 로그인·가입·코드 발송·코드 확인·존재 확인 엔드포인트에는 IP별 분당 budget(`rateLimit`)이 걸려 있다. 위의 번호별·계정별
  제한과 별개인 홍수 방어이고(로그인한 사용자의 발송과 비밀번호 변경은 계정 기준), 앱은 `option.setRateLimit({ endpoints })`로
  조정한다.
- 재가입 제한은 탈퇴 시각 기준이다. 삭제 직전에 accountId·phone 해시별로 탈퇴 시각을 남기고(삭제된 행은 읽을 수 없으므로)
  `resignupDays`와 비교한다.
- 한 JWT가 `self`와 `me`를 함께 싣되, 각 신원은 자기 세션 id(`selfSid`/`meSid`)를 따른다. 폐기된 세션에서 나온 access
  token은 남은 수명(7일) 동안 거부되고, refresh는 다른 쪽 신원이 아직 유효할 때만 다시 싣는다.
- refresh token은 회전된다. 브라우저는 탭 사이에서도 한 번에 하나만 refresh하고, 서버는 10초 안의 재사용을 형제 회전으로
  받는다. 그 밖의 재사용은 계정의 모든 브라우저 세션을 끊는다. 한 토큰을 여러 프로세스가 쥐는 호출자(클라우드 CLI)만
  `{ graceMs, reuseRevokes: "lineage" }`로 lineage만 끊는다.
- CSR 클라이언트(네이티브 셸)는 API와 오리진이 달라 HttpOnly refresh 쿠키를 받지도 보내지도 못한다. 로그인·refresh 응답
  본문의 refresh token을 user·admin 범위별로 OS 자격 증명 저장소(`secretStorage`)에 두고 refresh 본문으로 보낸다. 재설치한
  앱은 첫 실행에서 그 저장소를 비우므로 이전 설치의 로그인을 이어받지 않는다.
- 웹 SSO는 HttpOnly `ssoState` 쿠키로 state를 브라우저에 묶는다. GitHub는 바뀌지 않는 숫자 id(`github:<id>`)로, Apple은
  JWKS로 검증한 `sub`(`apple:<sub>`)로 식별하고, 이메일 공급자는 검증된 주소만 받는다. 종착지는 같은 사이트 경로만 허용한다.

## Workflow
- prepare user 생성(signup token 발급) → 인증·프로필 단계 → activate.
- 로그인은 access token과 refresh session을 발급한다.
- 관리자는 역할, 제한, 계정 정보, 프로필 상태를 조정할 수 있다.

prepare -> active -> dormant -> active, active|dormant -> restricted -> active
