# localFile Abstract
blob storage의 공개 로컬 파일을 HTTP Response로 읽어 제공한다.

## Rules
- `private/`로 시작하는 경로는 localFile로 서빙하지 않는다.
- endpoint 경로 뒤의 나머지 문자열을 storage path로 사용한다.
- 서비스는 파일을 변환하지 않고 storage stream을 그대로 반환한다.
- 응답의 Content-Type은 저장된 이름의 확장자로 정하고 `nosniff`를 붙인다. 브라우저가 내용을 보고 HTML로 열지 못하게 한다.
