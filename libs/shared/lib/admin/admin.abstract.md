# admin Abstract
관리자 계정, 권한, 세션 토큰을 관리해 운영자 인증 경계를 제공한다.

## Rules
- 비밀번호는 저장 전 해시되며 원문을 보관하지 않는다.
- root admin은 초기화 시 항상 `admin`과 `superAdmin` 역할을 가진다.
- 비밀번호 변경, 관리자 삭제, 역할 회수 시 연결된 refresh session을 폐기하고, 그 세션에서 나온 access token도 거부한다.
- 역할 부여/회수는 요청자의 권한 레벨을 넘지 않아야 한다.
- viewer·manager·admin·superAdmin은 모두 staff다. staff는 사용자 데이터를 읽고 고칠 수 있고(`Staff`, `SelfOrAdmin`),
  자격 증명·제재·역할 변경은 admin 이상(`Admin`)만 한다.
- 사용자 토큰에 함께 실린 `me`는 사용자 refresh 때마다 현재 역할로 다시 읽고, 삭제된 관리자는 빠진다.
- 멘션 슬라이스(`inMention`)는 `Staff` 가드를 직접 선언한다(이름 있는 slice는 root 가드를 상속하지 않는다). 멘션 소스는
  "이 모델의 라벨을 전부 달라"는 엔드포인트이므로, 관리자가 아닌 사용자에게 절대 열려서는 안 된다.
- 멘션 칩 라벨은 `accountId`의 로컬파트만 쓴다(`hello@x.com` → `hello`). 본문에 관리자 이메일 전체가 남지 않게 한다.

## Workflow
- 초기화 여부를 확인한 뒤 최초 관리자만 생성한다.
- 로그인은 refresh session을 만들고 access token에 관리자 식별자를 담는다.
