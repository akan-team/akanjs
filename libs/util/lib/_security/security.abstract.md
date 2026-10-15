# security Abstract
JWT 서명/검증과 refresh token 생성을 제공한다. endpoint는 열지 않고, 서버 코드가 service로만 부른다.

## Rules
- access token은 appName, environment, tokenType(`access`), sid, jti를 담아 서명한다. 만료는 기본 7일이고(OAuth 토큰은
  `accessTokenSeconds`), refresh token은 30일이다.
- 요청의 bearer token은 `resolveJwt`가 서명과 appName·environment를 함께 확인하고, 하나라도 어긋나면 익명으로 읽는다.
- refresh token은 원문 대신 hash를 저장하도록 opaque token과 hash를 함께 만든다.
- 용도가 있는 토큰(가입 토큰 등)은 `sign(message, { expiresIn, typ })`로 발급하고 같은 `typ`으로 `verify`한다. 다른 `typ`의
  토큰은 `unexpectedTokenType`으로 거부된다.
