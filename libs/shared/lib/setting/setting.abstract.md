# setting Abstract
서비스 전역 설정을 단일 active setting 문서로 제공한다.

## Rules
- active setting이 없으면 기본값으로 즉시 생성한다.
- 설정은 사용자 가입/재가입 정책 같은 공유 서비스 규칙에 사용된다.
- 클라이언트 store는 별도 상태를 만들지 않고 signal 기반 설정을 따른다.
