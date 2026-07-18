# util Abstract
util 라이브러리의 batch 루트 서비스와 공용 UI 상태 store를 제공한다.

## Rules
- service와 endpoint는 하위 util 기능을 묶는 빈 루트 컨테이너다.
- store는 알림 권한과 지도 중심, zoom, bounds 상태를 관리한다.
- 지도 화면 맞춤은 coordinate helper의 bounds/center/zoom 계산을 사용한다.
