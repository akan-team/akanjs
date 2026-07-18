# accessStat Abstract
접근 로그를 request, device, ip, country 기준으로 요약한다.

## Rules
- 모든 통계 값은 정수이며 기본값은 0이다.
- 세부 로그는 accessLog에 남기고 이 scalar는 집계 값만 담는다.
