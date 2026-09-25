# admin Abstract
관리자 계정, 권한, 세션 토큰을 관리해 운영자 인증 경계를 제공한다.

## Rules
- 비밀번호는 저장 전 해시되며 원문을 보관하지 않는다.
- root admin은 초기화 시 항상 `admin`과 `superAdmin` 역할을 가진다.
- 비밀번호 변경이나 관리자 삭제 시 연결된 refresh session을 폐기한다.
- 역할 부여/회수는 요청자의 권한 레벨을 넘지 않아야 한다.
- 멘션 슬라이스(`inMention`)는 모델의 root 가드(`Admin`)를 그대로 상속한다. 멘션 소스는 "이 모델의 라벨을 전부 달라"는
  엔드포인트이므로, 모델 자체를 볼 수 없는 사용자에게 절대 열려서는 안 된다.
- 멘션 칩 라벨은 `accountId`의 로컬파트만 쓴다(`hello@x.com` → `hello`). 본문에 관리자 이메일 전체가 남지 않게 한다.

## Workflow
- 초기화 여부를 확인한 뒤 최초 관리자만 생성한다.
- 로그인은 refresh session을 만들고 access token에 관리자 식별자를 담는다.
