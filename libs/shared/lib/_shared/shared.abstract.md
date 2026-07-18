# shared Abstract
shared 라이브러리의 batch용 루트 서비스와 인증 store 조정을 제공한다.

## Rules
- 서비스 자체는 batch server mode에서 동작하는 빈 루트 컨테이너다.
- 클라이언트 로그인은 admin/self auth 초기화 후 redirect를 처리한다.
- 로그아웃은 user token을 비우고 local admin/self 상태를 초기화한다.
