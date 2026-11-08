# admin Abstract
관리자 계정, 권한, 세션 토큰을 관리해 운영자 인증 경계를 제공한다.

## Rules
- 비밀번호는 저장 전 해시되며 원문을 보관하지 않는다.
- 부팅은 root admin이 없을 때만 `admin`·`superAdmin`으로 만든다. 이미 있는 root의 비밀번호와 역할은 옵션
  `resetRootAdmin: true`일 때만 설정값으로 되돌리고, 그 밖에는 콘솔에서 바꾼 값이 재부팅 뒤에도 남는다.
- 비밀번호 로그인은 없는 계정과 틀린 비밀번호에 같은 `admin.error.invalidCredentials`로 답하고, 없는 계정에도 bcrypt
  검증을 한 번 치른다. 실패는 `adminCache`에 계정·IP별로 세어 user 로그인과 같은 기준으로 잠근다(`tooManySigninAttempts`).
- SSO는 있는 관리자면 `canSignin(accountId, ssoType)`, 없으면 `canSignup`이 허락해야 하며, 정책이 없으면 아무도 못
  들어온다. 이메일 검증을 보장하지 않는 naver·facebook은 정책과 무관하게 관리자 경로에서 거부한다.
- 본인 비밀번호를 바꿀 때는 현재 비밀번호를 요구한다. 자격 증명·역할·SQL 엔드포인트는 `Person`으로 에이전트 호출을 막는다.
- 비밀번호 변경, 관리자 삭제, 역할 회수 시 연결된 refresh session을 폐기하고, 그 세션에서 나온 access token도 거부한다.
- 역할 부여/회수는 요청자의 권한 레벨을 넘지 않아야 한다. `setAdminRoles`는 역할 목록 전체를 한 번에 바꾸며, 더하거나
  빼는 역할마다 같은 정책을 검사해 하나라도 거절되면 아무것도 바꾸지 않는다. 저장과 역할 정책의 `onChange`(역할마다 한 번)는
  한 트랜잭션이고, 빠진 역할이 있으면 커밋 뒤 세션을 폐기한다.
- viewer·manager·admin·superAdmin은 모두 staff다. staff는 사용자 데이터를 읽을 수 있지만(`Staff`, `SelfOrStaff`),
  남의 사용자 레코드를 고치거나 지우는 일(`SelfOrAdmin`)과 자격 증명·제재·역할 변경(`Admin`)은 admin 이상만 한다.
- 플랫폼 관리자(`PlatformAdmin`)는 `Admin`이면서 id가 env `AKAN_PLATFORM_ADMIN_IDS`(쉼표 구분) 목록에 있는 관리자다.
  목록은 env로만 바뀌고, 비어 있으면 아무도 플랫폼 관리자가 아니다. `isPlatformAdmin`은 로그인한 관리자가 목록에
  있는지만 답한다.
- 사용자 토큰에 함께 실린 `me`는 사용자 refresh 때마다 현재 역할로 다시 읽고, 삭제된 관리자는 빠진다. 관리자 refresh도
  함께 실린 `self`를 다시 읽고, 없거나 로그인할 수 없는 사용자는 뺀다.
- 멘션 슬라이스(`inMention`)는 `Staff` 가드를 직접 선언한다(이름 있는 slice는 root 가드를 상속하지 않는다). 멘션 소스는
  "이 모델의 라벨을 전부 달라"는 엔드포인트이므로, 관리자가 아닌 사용자에게 절대 열려서는 안 된다.
- 멘션 칩 라벨은 `accountId`의 로컬파트만 쓴다(`hello@x.com` → `hello`). 본문에 관리자 이메일 전체가 남지 않게 한다.

## Workflow
- 초기화 여부를 확인한 뒤 최초 관리자만 생성한다.
- 로그인은 refresh session을 만들고 access token에 관리자 식별자를 담는다.
