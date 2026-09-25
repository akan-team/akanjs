# insightRows Abstract
읽기 전용 인사이트 질의 하나의 답을 나른다.

## Rules
- rows는 모델이 아니라 질의의 모양을 따른다. 그래서 `Any` 이고, 컬럼 집합은 호출마다 다르다.
- truncated가 true 면 답이 잘린 것이다. 소비자는 전체로 읽어서는 안 되고, 화면에 그렇게 표시해야 한다.
- 여기에는 어떤 모델의 `hidden`/`secret` 필드도 담기지 않는다. `InsightQuery` 가 `_doc` 을 경계에서 막기 때문이며,
  이 스칼라가 그것을 다시 검사하지는 않는다.
