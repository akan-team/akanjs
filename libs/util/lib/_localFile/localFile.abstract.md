# localFile Abstract
blob storage의 공개 로컬 파일을 HTTP Response로 읽어 제공한다.

## Rules
- `private/`로 시작하는 경로는 localFile로 서빙하지 않는다.
- endpoint 경로 뒤의 나머지 문자열을 storage path로 사용한다.
- 서비스는 파일을 변환하지 않고 storage stream을 그대로 반환한다. Content-Type은 달지 않는다: Bun.serve가 저장된 이름의
  확장자로 정하고 Range에 206으로 답한다. 직접 달면 API 라우터가 본문 전체를 읽어 압축하고 Range를 무시한다.
- `nosniff`는 선언된 타입을 내용으로 바꾸지 못하게 할 뿐이다. `.html`·`.svg`로 저장된 파일은 그 타입으로 나가므로, PDF가 아닌
  모든 응답에 `default-src 'none'; style-src 'unsafe-inline'; sandbox` CSP를 붙여 API 오리진에서 스크립트가 돌지 못하게 한다.
  `<img>`·`<video>` 삽입은 영향이 없고, PDF는 브라우저 뷰어가 sandbox 문서를 거부해 뺀다.
