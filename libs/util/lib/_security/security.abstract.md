# security Abstract
JWT 서명/검증, AES 암복호화, refresh token 생성을 제공한다.

## Rules
- access token은 appName, environment, tokenType, sid, jti를 포함해 서명한다.
- access token 만료는 15분, refresh token 만료는 30일 기준이다.
- refresh token은 원문 대신 hash를 저장하도록 opaque token과 hash를 함께 만든다.
- verifyToken은 현재 appName과 environment가 맞는 토큰만 해석한다.
- encrypt endpoint는 None 가드로 닫혀 있다. 열려 있으면 앱의 AES 키로 아무 입력이나 암호화하는 oracle이 되므로, 암호화는 서버 코드가 service로만 부른다.
