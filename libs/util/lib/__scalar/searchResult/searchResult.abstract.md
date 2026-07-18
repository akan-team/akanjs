# searchResult Abstract
텍스트 검색 결과 문서와 페이지네이션 메타를 표준화한다.

## Rules
- docs는 검색된 TextDoc 배열을 담는다.
- skip, limit, total은 검색 페이지 계산에 사용한다.
- sort는 정렬 기준 문자열이며 기본값은 미구현 상태를 나타낸다.
