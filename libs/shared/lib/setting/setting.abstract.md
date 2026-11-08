# setting Abstract
서비스 전역 설정을 단일 active setting 문서로 제공한다.

## Rules
- active setting은 서버가 뜰 때 init이 없으면 기본값으로 만든다. 인스턴스가 여럿이어도 한 번만 만든다(`once`). 조회는 쓰지 않는다.
- `getActiveSetting`은 로그인 없이 읽히고(Public) `LightSetting`만 돌려준다 — shared 필드와, 앱이 자기 `LightSetting`에
  올린 필드뿐이다(lu의 `minAppVersion`). 앱이 확장한 필드는 이 lib의 `Setting` 클래스에 그대로 합쳐지므로 `Setting`을
  돌려주면 앱의 프롬프트까지 모두 공개된다. 로그인한 화면이 읽을 앱 필드는 앱이 따로 가드를 건 쿼리로 내준다.
- 전체 설정은 관리자만 읽고 쓴다(슬라이스 `get`·`cru`가 `Admin`). 관리자 화면은 `getActiveSetting`으로 id만 얻고 슬라이스로 연다.
- 설정은 사용자 가입/재가입 정책 같은 공유 서비스 규칙에 사용된다.
- 클라이언트 store는 별도 상태를 만들지 않고 signal 기반 설정을 따른다.
