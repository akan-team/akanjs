# summary Abstract
여러 도메인의 집계값을 active 문서와 시간별 archive로 유지한다.

## Rules
- active summary는 type이 `active`인 한 행이다. 중복 active 문서는 가장 최근 것만 남기고 제거한다.
- active summary가 없으면 0이 아니라 실제 집계(`makeSummary`)로 만든다. cron이 꺼진 edge/local에서도 증감이 실제 값에서 출발한다.
- periodic archive는 (period type, 정시) 하나당 한 행이다. id가 그 정시와 type에서 나오므로 같은 시간을 두 번 쓰면 기본키에서 막힌다.
- 집계 필드는 getQueryMeta로 셀 모델과 쿼리를 선언하고, 그 쿼리로 직접 count하거나 증감/이동 연산으로 갱신한다.
- 필드가 많아지므로 archive는 필드별 update가 아니라 문서 전체를 다시 쓴다.
- 활성 요약과 기간 이력은 Admin만 조회한다. 활성 요약은 1초 캐시한다.
- 기간 목록 요청 하나는 최대 `MAX_PAGE_SIZE`(500)행이라, 화면의 기간은 시간별 500시간, 일별 500일로 잘린다.

## Workflow
- batch cron이 주기적으로 summarize 결과를 archive한다.
- admin은 recountSummary로 지금 즉시 다시 집계할 수 있다.
