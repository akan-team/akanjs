# user Abstract
사용자 가입, 인증, 상태 전이를 관리한다. 프로필 사진 심사(`appliedImages`)는 lu가 따로 한다.

## Rules
- active/dormant/restricted 계정의 accountId와 phone은 중복될 수 없다.
- prepare 사용자의 id만으로는 아무것도 할 수 없다. 모든 가입 단계와 활성화는 그 draft에 묶인 signup token(`typ: "signup"`,
  24시간)을 함께 내야 하고, `generatePrepareUser`는 살아 있는 draft만 토큰으로 이어 준다. 관리자 활성화
  (`activateUserByAdmin`)는 가입 정책을 건너뛰고 세션을 발급하지 않는다.
- signup token을 발급하는 응답은 같은 토큰을 HttpOnly 쿠키로도 내리고, 인자가 비어 있으면 서버가 그 쿠키를 읽는다.
  SSR 페이지는 쿠키만 쓰고 CSR·네이티브는 인자로 낸다. 활성화 응답은 그 쿠키를 만료시킨다.
- 활성화에는 정책의 verify가 하나 이상 있어야 한다. 기본은 accountId가 이메일 주소인 draft에 이메일을 증명한 verify
  (`Verify.provesEmail`)를, accountId가 주소가 아닌 draft(지갑·휴대폰 가입, GitHub의 `github:<id>`)에 password를 뺀
  verify를 요구한다.
  `signup.requireVerifiedEmail: false`나 `activateVerifies: [...Verify.provesIdentity]`는 password를 뺀 전부를 받는다.
  `signup.activateVerifies: []`만이 인증 없는 가입을 허용한다. 가입자가 직접 내는 accountId는 이메일 주소여야 하고
  SSO 행의 `<provider>:<id>` 모양(`:`)일 수 없다. 활성화 화면에서 동의한 약관(`activateUserWithAgreePolicies`)은 활성화와 함께 쓰여, 거절되면 동의도
  남지 않는다.
- 인증된 이메일은 두 가지다. accountId가 주소이고 email·google·kakao·naver·apple·facebook verify 중 하나가 있으면 그
  accountId(`Verify.provesEmail`)이고, 가입한 뒤에 인증번호로 증명한 주소(`verifiedEmails`, 소문자)가 더해진다
  (`listVerifiedEmails`). password만으로는 주소를 증명하지 않는다.
- 활성 계정은 `requestEmailCodeInActiveUser` → `verifyEmailInActiveUser`(`Person`)로 주소를 증명한다. 인증번호 칸은
  가입·비밀번호 재설정 칸과 따로다(계정마다 목적별로 하나, 주소를 함께 기록, 10분, 한 번). 그래서 한쪽 코드는 다른 쪽에서
  통하지 않고, 공개 재설정 요청이 진행 중인 인증 코드를 지우지 못한다. 틀린 코드 횟수(하루 10번)도 목적별로 세서 공개 재설정
  확인을 틀려도 인증 경로는 막히지 않는다(반대도 같다). 주소별 시간당 5통은 가입·재설정과 함께 세고, 요청은 계정별 시간당 5번으로 묶는다. accountId와 같은 주소면 가입처럼 `email` verify를 더하고, 다른 주소(또는 그
  사이 accountId가 옮겨 간 주소)면 `verifiedEmails`에 더하며, 쓰기가 남지 않으면 `emailVerifyNotSaved`로 거절한다.
  accountId는 바뀌지 않고, accountId가 바뀌어도 `verifiedEmails`는 남는다.
- 본인은 `verifiedEmailsOfSelf`로 초대가 믿는 주소(증명된 accountId + `verifiedEmails`)를 보고,
  `removeVerifiedEmailOfSelf`(`Person`)로 `verifiedEmails`의 주소 하나를 삭제한다. accountId와 `verifies`는 건드리지 않는다.
  지금 accountId와 같은 주소는 증명 여부와 상관없이 로그인 주소라 삭제할 수 없다(`signinEmailNotRemovable`). 삭제한 주소로
  온 이메일 초대는 목록에서 사라지고 수락이 거절되지만, 이미 계정(id)에 연결된 초대는 건드리지 않는다.
- 이 경로는 다른 계정을 읽지 않지만, 주소별 발송 한도를 재설정과 함께 세므로 한도 응답(`tooManyEmailCodes`)은 그 주소가
  가입된 accountId인지 드러낼 수 있다. 공개 `userExistsHasAccountId`가 이미 주는 정보다.
- 가입 인증번호 메일이 나가지 못하면 `user.error.emailCodeMailFailed` 로 알린다. 비밀번호 재설정 코드는 계정 존재를 드러내지
  않도록 실패해도 같은 응답을 준다. 임시 비밀번호 재설정(`resetPassword`)도 없는 계정과 3분 안의 재요청에 보낸 것처럼 답한다
  (메일 서버가 실패할 때만 `resetMailFailed`).
- SSO·email·password verify는 그것을 얻은 accountId에만 유효하다. prepare 사용자의 accountId가 바뀌면(직접 설정이든 다른
  공급자의 SSO든) phone·wallet만 남고, 같은 accountId를 다시 내면 그대로 둔다.
- 활성 사용자의 accountId가 바뀌면(관리자 `setAccountIdByAdmin`) 이메일 증명 verify(`Verify.isEmailProof`)를 모두 지운다.
  phone·wallet·password·github는 남는다. 공급자가 id를 바꾼 SSO(`renameSsoAccountId`)는 그 공급자 verify만 남기고 다른 이메일
  증명을 지운다. 새 주소는 스스로 증명해야 인증된 이메일이 된다.
- 모든 로그인 경로(비밀번호, 휴대폰, SSO, refresh)는 같은 관문을 지난다. restricted는 제한이 끝날 때까지 막히고, 끝난 제한은
  로그인 시점과 10분 주기 cron에서 풀린다. dormant는 로그인할 수 있다. 제한과 역할 회수(`subUserRole`)는 그 계정의 세션을
  끊는다.
- 상태 전이(가입, 활성화, 제한·해제, 휴면·복귀, 삭제)는 실제로 상태가 바뀔 때만 summary 카운터를 옮긴다.
- 휴대폰 인증번호는 계정·용도마다 하나만 살아 있고, 틀린 횟수는 하루 10회로 묶인다. 번호마다 하루 10통까지 보낸다.
  서명 토큰은 해시로만 저장하고 한 번 쓰면 사라지며, 로그인용과 비밀번호용이 서로 대신하지 못한다. 휴대폰 로그인은 userId를
  드러내지 않는다.
- 비밀번호 로그인은 계정·호출 주소마다 15분에 10번, 주소와 상관없이 계정마다 50번 틀리면 잠긴다. 그래서 남의 주소에서 틀린
  횟수가 계정 상한 아래면 주인의 주소는 막히지 않고, 잠겨도 인증번호·서명 토큰·SSO 로그인은 열려 있다. 없는 계정과 비밀번호
  없는 계정도 bcrypt 비교를 한 번 해서 틀린 비밀번호와 같은 오류로 답한다. 해시 없이 저장된 옛 비밀번호는 맞힌 로그인에서
  길이 규칙 없이 해시로 다시 저장되고 password verify가 더해지며, 세션은 끊지 않는다.
- 비밀번호 변경(`changePassword`, `setPasswordWithSignToken`)과 관리자가 남의 자격 증명을 바꾸거나 대신 토큰을 받는 일
  (`setPasswordByAdmin`, `setPhoneByAdmin`, `setAccountIdByAdmin`, `getAccessTokenByAdmin`)은 `Person`이 필요하다. 에이전트
  토큰으로는 어느 전송으로도 부를 수 없고 MCP 카탈로그에도 없다.
- 로그인·가입·코드 발송·코드 확인·존재 확인(분당 20번) 엔드포인트에는 IP별 분당 budget(`rateLimit`)이 걸려 있다. 위의 번호별·계정별
  제한과 별개인 홍수 방어이고(로그인한 사용자의 발송과 비밀번호 변경은 계정 기준), 앱은 `option.setRateLimit({ endpoints })`로
  조정한다.
- 본인이 `image`/`images`에 둘 수 있는 File은 자기 세션이 올린 것(`file.uploader`)과 이미 그 행에 있는 것뿐이다
  (`OwnImages`, `user.error.imageNotUploadedBySelf`). 관리자는 아무 File이나 둔다. 업로더가 기록되기 전에 올라간 파일은
  이미 프로필에 있을 때만 남는다.
- 재가입 제한은 탈퇴 시각 기준이다. 삭제가 끝난 뒤에 accountId·phone 해시별로 탈퇴 시각을 남기고(재가입은 삭제된 행을
  읽을 수 없으므로) `resignupDays`와 비교한다.
- 탈퇴 설문은 삭제 호출(`leaveSelf`, `Person`)과 함께 오고, 삭제가 끝난 뒤에 삭제된 행에 기록된다. 다른 lib의 pre-remove
  hook이 삭제를 거절하면 설문도 탈퇴 시각도 남지 않는다. 설문 쓰기는 best-effort라 실패해도 로그만 남기고 탈퇴는 성공으로
  답한다. `leaveAndSignoutSelf`는 그 기기의 푸시 토큰을 삭제보다 먼저 빼고(삭제된 행은 쓰기가 닿지 않는다) 세션 쿠키를 지우는
  응답을 준다.
- 한 JWT가 `self`와 `me`를 함께 싣되, 각 신원은 자기 세션 id(`selfSid`/`meSid`)를 따른다. 폐기된 세션에서 나온 access
  token은 남은 수명(7일) 동안 거부되고, refresh는 다른 쪽 신원이 아직 유효할 때만 다시 싣는다. 사용자 로그인이 이어 싣는
  관리자 `me`는 폐기 확인이 실패하면 싣지 않는다.
- refresh token은 회전된다. 브라우저는 탭 사이에서도 한 번에 하나만 refresh하고, 서버는 10초 안의 재사용을 형제 회전으로
  받는다. 그 밖의 재사용은 계정의 모든 브라우저 세션을 끊는다. 한 토큰을 여러 프로세스가 쥐는 호출자(클라우드 CLI)만
  `{ graceMs, reuseRevokes: "lineage" }`로 lineage만 끊는다. OAuth 클라이언트에 발급된 refresh token은 여기서 모르는
  토큰으로 거절되고, 아무것도 회전하거나 끊지 않는다.
- CSR 클라이언트(네이티브 셸)는 API와 오리진이 달라 HttpOnly refresh 쿠키를 받지도 보내지도 못한다. 로그인·refresh 응답
  본문의 refresh token을 user·admin 범위별로 OS 자격 증명 저장소(`secretStorage`)에 두고 refresh 본문으로 보낸다. 재설치한
  앱은 첫 실행에서 그 저장소를 비우므로 이전 설치의 로그인을 이어받지 않는다.
- 세션·refresh 쿠키는 local 밖에서 `__Host-` 이름(`__Host-jwt:<appName>`, `__Host-userRefreshToken:<appName>`)이라
  형제 서브도메인이나 상위 도메인이 사본을 심을 수 없다. 이전 이름은 읽지 않고 로그인·로그아웃이 지운다.
- 웹 SSO는 HttpOnly `__Host-ssoState` 쿠키(local은 `ssoState`)로 state를 브라우저에 묶고, provider의 `redirect_uri`
  origin은 쿠키가 아니라 요청에서 서버가 정하며 앱이 선언한 호스트가 아니면 거절한다. `X-Forwarded-Host`/`-Proto`는 신뢰
  홉(게이트웨이, `AKAN_TRUSTED_PROXIES`가 인정하는 프록시)에서 온 것만 세므로 TLS를 끝내는 프록시는 신뢰 홉이어야 한다. 두 번 온
  세션·refresh 쿠키는 없는 것으로 읽는다. GitHub는 바뀌지 않는 숫자 id(`github:<id>`)로, Apple은 JWKS로 검증한
  `sub`(`apple:<sub>`)로 식별하고, 이메일 공급자는 검증된 주소만 받는다. 종착지는 같은 사이트 경로만 허용한다.
- login으로 저장된 옛 GitHub 행은 GitHub가 그 계정에 인증해 준 주소를 그 행이 가질 때만(`verifiedEmails`나 이메일인
  accountId) 숫자 id로 옮겨진다. 아니면 옮기지 않고 새 가입으로 가며, 경고 로그에는 user id만 남긴다. 네이티브 SSO는
  hand-off 때 옮긴다.

## Workflow
- prepare user 생성(signup token 발급) → 인증·프로필 단계 → activate. 인증번호·비밀번호·SSO 단계의 실행은 `_sign`
  서비스가 맡는다.
- 로그인은 access token과 refresh session을 발급한다. 세션 쿠키는 서버가 HttpOnly로 내리고(`SessionCookie`), 페이지는
  서명 없는 claims 쿠키로 만료를 읽는다. `getAccessTokenByAdmin`은 토큰을 본문으로만 돌려주고 쿠키를 건드리지 않는다.
- 관리자는 역할, 제한, 계정 정보, 프로필 상태를 조정할 수 있다.

prepare -> active -> dormant -> active, active|dormant -> restricted -> active
