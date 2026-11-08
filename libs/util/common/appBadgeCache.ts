//* 앱 아이콘 배지 상태({ enabled, unread: { 알림 주소: 개수 } })를 서비스워커와 페이지가 함께 읽는 Cache Storage 자리. 생성기와 페이지가 같은 값을 써야 한다.
//* 숫자를 지우는 앱만 enabled 를 켠다 — 같은 워커를 쓰면서 지우지 않는 앱의 배지가 끝없이 쌓이지 않게.
export const appBadgeCache = { name: "akan-app-badge", path: "/__akan_app_badge__" } as const;
