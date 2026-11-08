# sign Service Abstract

가입·로그인 절차(아이디·비밀번호, 휴대폰·이메일 인증번호, 서명 토큰, 비밀번호 재설정, SSO)를 실행한다. 계정 상태와 저장은
user 모듈이 갖고, 코드·토큰·잠금 규칙은 `user.abstract.md`를 따른다.

## Rules

- 묶음 엔드포인트(`generatePrepareUserWithAccountId`, `startPhoneSign`, `signinWithPhoneCode`)는 따로 부르던 단계의 검사를
  그대로 지난다: accountId·phone 중복과 재가입 제한, 번호별 발송 한도, 인증번호 확인, 서명 토큰 한 번 사용. 각 단계가
  `[Public]`이거나 이 호출이 만든 signup token에 묶였던 단계라 `[Public]`이고, 따로일 때 가장 빡빡한 `rateLimit`을 쓴다.
- draft와 그 accountId·phone은 한 트랜잭션으로 생겨, 이미 쓰는 값이면 draft도 남지 않는다. 인증번호 발송은 커밋 뒤라 메일·문자
  실패가 그대로 호출자에게 간다.
- `startPhoneSign`은 가입된 번호에는 로그인 코드만 보내고 null로 답해 누구의 계정인지 드러내지 않는다. 새 번호는 signup
  token이 이어 주는 draft(없으면 새 draft)에 담긴다.
- `MASTER_PHONES`의 번호가 문자 없이 `MASTER_PHONECODE`를 받는 것은 local 실행이나 testing 환경에서뿐이다. 그 밖에서는
  그 번호도 새 코드를 문자로 받고, 값이 설정돼 있으면 부팅 때 경고 한 줄을 남긴다.
- SignService는 user·setting·admin 서비스를 주입받기만 한다. user 쪽이 SignService를 주입하면 상호 주입이 되므로, 앱이
  부르는 가입·로그인 단계는 user signal이 `srv.user.with(srv.sign)`로 직접 부른다.
