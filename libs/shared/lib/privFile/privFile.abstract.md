# privFile Abstract
외부 공개 URL 없이 private storage 경로로만 접근하는 파일을 관리한다.

## Rules
- private file은 `private/<purpose>/<group>/<id>` 경로에 저장한다.
- 업로드 완료 전에는 privatePath를 비워 두고 진행률을 기록한다.
- privatePath가 없으면 읽기와 저장을 허용하지 않는다.
- 문서 삭제 시 private storage 데이터도 함께 삭제한다.

## Workflow
- 로컬 파일을 private storage에 올린 뒤 active 상태와 privatePath를 확정한다.
