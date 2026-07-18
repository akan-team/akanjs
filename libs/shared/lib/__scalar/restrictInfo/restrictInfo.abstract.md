# restrictInfo Abstract
사용자 제한의 만료 시점과 사유를 담는다.

## Rules
- 제한은 reason과 until을 함께 가진다.
- user 서비스가 제한 적용과 해제를 통해 이 값을 설정하거나 제거한다.
