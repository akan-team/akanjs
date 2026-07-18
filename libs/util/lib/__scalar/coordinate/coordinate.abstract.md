# coordinate Abstract
GeoJSON Point 좌표와 고도를 표현하고 거리/방위 계산을 제공한다.

## Rules
- type은 `Point`로 고정된다.
- coordinates는 longitude, latitude 순서를 따른다.
- 거리 계산은 지구 반지름 기반 구면 거리이며 3D 계산은 altitude 차이를 더한다.
- 지도 표시용 bounds, center, zoom 계산은 좌표 목록이 있을 때만 가능하다.
