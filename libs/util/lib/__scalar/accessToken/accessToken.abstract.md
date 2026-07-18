# accessToken Abstract
클라이언트에 전달할 access JWT와 선택적 refresh token, 만료 시각을 담는다.

## Rules
- jwt는 항상 포함한다.
- refreshToken은 세션 갱신이 필요한 응답에서만 포함한다.
- expiresAt은 access token 만료 안내용 값이다.
