# encourageInfo Abstract
사용자의 journey와 inquiry 진행 상태 및 갱신 시점을 담는다.

## Rules
- journey와 inquiry는 각각 정해진 enum 단계만 가진다.
- 각 상태는 별도 timestamp와 함께 갱신된다.
- 기본 상태는 모두 `welcome`이다.
