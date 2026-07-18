# accessLog Abstract
요청 접근의 시간, 위치, IP, 브라우저, 디바이스 정보를 기록한다.

## Rules
- 위치 정보는 coordinate scalar를 사용한다.
- at은 생성 시 현재 시각을 기본값으로 가진다.
- period는 집계 구간 분류에 쓰는 정수 값이다.
