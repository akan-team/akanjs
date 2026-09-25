# admin Abstract
관리자 계정, 권한, 세션 토큰을 관리해 운영자 인증 경계를 제공한다.

## Rules
- 비밀번호는 저장 전 해시되며 원문을 보관하지 않는다.
- root admin은 초기화 시 항상 `admin`과 `superAdmin` 역할을 가진다.
- 비밀번호 변경이나 관리자 삭제 시 연결된 refresh session을 폐기한다.
- 역할 부여/회수는 요청자의 권한 레벨을 넘지 않아야 한다.
- 검색 색인에는 `accountId`(제목)와 `roles`(범위 한정)만 올린다. `password`는 secret이라 색인 자체가 거부된다.

## Workflow
- 초기화 여부를 확인한 뒤 최초 관리자만 생성한다.
- 로그인은 refresh session을 만들고 access token에 관리자 식별자를 담는다.
