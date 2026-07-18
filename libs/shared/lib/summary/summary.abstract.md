# summary Abstract
여러 도메인의 집계값을 active 문서와 시간별 archive로 유지한다.

## Rules
- active summary는 하나만 유지하고 중복 active 문서는 제거한다.
- periodic archive는 현재 시간의 period type과 at 기준으로 upsert한다.
- 집계 필드는 직접 count하거나 증감/이동 연산으로 갱신한다.
- public 조회는 active summary만 캐시해 제공한다.

## Workflow
- batch cron이 주기적으로 summarize 결과를 archive한다.
